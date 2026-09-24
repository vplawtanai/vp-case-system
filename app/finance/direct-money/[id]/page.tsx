"use client";
import { FinanceDocumentNextAction } from "../../document-decision/next-action";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Pencil, RotateCcw } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import { useI18n } from "../../../../lib/i18n/provider";
import DetailModal from "../../../components/DetailModal";
import { QuotationGuard } from "../../quotations/shared";
import FinanceSubNav from "../../FinanceSubNav";
import { VpDistributionPanel } from "../../payments/vp-distribution-panel";
import { DirectAmounts, DirectMoneyForm } from "../form";
import { PageHeader, ReadOnlyGrid, StatusBadge } from "../../../components/ui/patterns";
import ui from "../../../components/ui/vp-ui.module.css";
import { directMoneyError, type DirectRecord } from "../shared";
import { DirectMoneyClassification } from "../classification";
import { DirectSourceEvidence, type DirectEvidenceClient } from "../source-evidence-display";
import styles from "../direct-money.module.css";

export default function DirectMoneyDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <QuotationGuard canAccess={access => access.permissions.canViewFinancePayments}>
    {access => <><FinanceSubNav activePage="payments" permissions={access.permissions} /><DirectMoneyDetail id={id} canManage={access.profile?.role === "admin"} /></>}
  </QuotationGuard>;
}
export function DirectMoneyDetail({ id, canManage }: { id: string; canManage: boolean }) {
  const { t, locale, date } = useI18n();
  const [row, setRow] = useState<DirectRecord | null>(null), [error, setError] = useState<unknown>(null), [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [ack, setAck] = useState(false), [reverseAck, setReverseAck] = useState(false), [reason, setReason] = useState("");
  const [classifyOpen, setClassifyOpen] = useState(false), [bankName, setBankName] = useState("");
  const [draftClient, setDraftClient] = useState<DirectEvidenceClient | null>(null);
  const [invalid, setInvalid] = useState(false), [success, setSuccess] = useState(false), [refreshRequired, setRefreshRequired] = useState(false);
  const [audit, setAudit] = useState<{ id: string; event_type: string; created_at: string; version: number }[]>([]);
  const lock = useRef(false), root = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null); setSuccess(false);
    try {
      const r = await supabase.from("finance_direct_money_receipts").select("*").eq("id", id).single();
      const a = await supabase.from("finance_direct_money_receipt_audit").select("id,event_type,created_at,version").eq("receipt_id", id).order("version", { ascending: false });
      if (r.error || a.error || !r.data) throw r.error || a.error || new Error("missing");
      // Only Drafts resolve a current master name. Confirmed evidence must never
      // fall back to a mutable Client if its frozen name is missing.
      let client: DirectEvidenceClient | null = null;
      if (r.data.status === "draft" && r.data.client_id) {
        const result = await supabase.from("clients").select("id,name").eq("id", r.data.client_id).single();
        if (!result.error) client = result.data;
      }
      setDraftClient(client);
      if (r.data.confirmed_snapshot_json?.bank) setBankName(`${r.data.confirmed_snapshot_json.bank.short_name} · ${r.data.confirmed_snapshot_json.bank.bank_name}`);
      else if (r.data.receiving_bank_account_id) {
        const bank = await supabase.from("finance_bank_accounts").select("short_name,bank_name").eq("id", r.data.receiving_bank_account_id).single();
        setBankName(bank.data ? `${bank.data.short_name} · ${bank.data.bank_name}` : r.data.receiving_bank_account_id);
      } else setBankName("");
      setRow(r.data); setAudit(a.data || []); setAck(false); setReverseAck(false); setReason(""); setRefreshRequired(false); return true;
    } catch (e) { setError(e); setRefreshRequired(true); return false; } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  async function act(action: "confirm" | "reverse") {
    if (!canManage || !row || lock.current || refreshRequired) return;
    const valid = action === "confirm" ? ack : reverseAck && reason.trim();
    if (!valid) { setInvalid(true); requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    lock.current = true; setBusy(true); setError(null); setSuccess(false);
    try {
      const result = await supabase.rpc("transition_finance_direct_money_receipt", { p_id: id, p_expected_version: row.version, p_action: action, p_acknowledged: true, p_reason: reason });
      if (result.error || result.data !== id) throw result.error || new Error("response");
      setSuccess(await load());
    } catch (e) { setError(e); setRefreshRequired(true); } finally { lock.current = false; setBusy(false); }
  }
  return <main className={`${ui.scope} ${styles.workspace}`} ref={root}>
    <Link className={styles.button} href="/finance/payments"><ArrowLeft size={16} />{t("finance.nav.payments")}</Link>
    <PageHeader title={<>{t("directMoney.title")} · {id.slice(0, 8).toUpperCase()}</>} description={t("directMoney.source")} actions={row ? <StatusBadge status={row.status} label={t(`directMoney.${row.status}`)} /> : null} />
    {loading ? <p role="status">{t("common.state.loading")}</p> : null}
    {error ? <p className={styles.summaryError} role="alert">{directMoneyError(error, locale)} <button className={styles.button} disabled={busy} onClick={() => void load()}>{t("common.actions.retry")}</button></p> : null}
    {success ? <p className={styles.success} role="status">{t("directMoney.saved")}</p> : null}
    {row ? <>
      {row.unclassified ? <p className={styles.warning}>{t("directMoney.classificationWarning")}</p> : null}
      {canManage && row.status === "confirmed" ? <button className={styles.button} disabled={busy || loading} onClick={() => setClassifyOpen(true)}>{t("directMoney.classify")}</button> : null}
      <section className={styles.section}><div className={styles.header}><h2>{t("directMoney.facts")}</h2>{canManage && row.status === "draft" ? <button className={styles.button} disabled={busy || loading} onClick={() => setOpen(true)}><Pencil size={16} />{t("directMoney.edit")}</button> : null}</div>
        <ReadOnlyGrid className={styles.facts} items={[["payer", row.payer_name], ["date", date(row.received_on)], ["method", t(`directMoney.${row.method}`)], ["account", bankName || row.cash_location || "-"], ["reference", row.reference_no || "-"], ["evidence", row.evidence_reference || "-"]].map(([key, value]) => ({ key, label: t(`directMoney.${key}`), value }))} />
        <DirectAmounts values={{ actualCash: Number(row.cash_amount), wht: Number(row.wht_amount), gross: Number(row.gross_amount), base: Number(row.amount_before_vat), vat: Number(row.vat_amount) }} />
        {row.note ? <p className={styles.readonly}>{row.note}</p> : null}
      </section>
      <section className={styles.section}><h2>{t("directMoney.composition")}</h2>{(row.classification_json?.lines || row.lines_json).map(line => <div className={styles.line} key={line.source_line_id}><h3>{line.description}</h3><p>{t(`directMoney.nature.${line.money_nature}`)}{line.classification ? ` · ${t(`finance.invoice.classification.${line.classification}`)}` : ""}</p><DirectSourceEvidence reason={line.reason} client={row.status === "draft" ? draftClient : row.confirmed_snapshot_json?.client} /><DirectAmounts values={{ base: line.base, vat: line.vat, wht: line.wht, gross: line.gross, actualCash: line.cash }} />{line.wht_applicability === "applies" ? <p className={styles.muted}>{t("directMoney.whtBase")}: {line.wht_base} · {t("directMoney.whtRate")}: {line.wht_rate}%</p> : null}</div>)}</section>
      {row.status === "confirmed" ? <FinanceDocumentNextAction directMoneyId={row.id} /> : null}
      {row.status !== "draft" ? <VpDistributionPanel key={row.version} directMoneyReceiptId={id} /> : null}
      {canManage && row.status === "draft" ? <section className={styles.review}><h2>{t("directMoney.review")}</h2><p className={styles.muted}>{t("directMoney.boundary")}</p><label className={styles.check}><input type="checkbox" checked={ack} disabled={busy} aria-invalid={invalid && !ack} onChange={e => { setAck(e.target.checked); setInvalid(false); }} />{t("directMoney.ack")}</label>{invalid && !ack ? <p className={styles.error} role="alert">{t("directMoney.error.required")}</p> : null}<button className={styles.primary} disabled={busy || loading || refreshRequired} onClick={() => void act("confirm")}>{t("directMoney.confirm")}</button></section> : null}
      {canManage && row.status === "confirmed" ? <section className={styles.section}><details><summary>{t("directMoney.otherActions")}</summary><p className={styles.muted}>{t("directMoney.reverseHelp")}</p><label className={styles.field}><span>{t("directMoney.reverseReason")}</span><textarea maxLength={2000} rows={2} value={reason} disabled={busy} aria-invalid={invalid && !reason.trim()} onChange={e => { setReason(e.target.value); setInvalid(false); }} /></label><label className={styles.check}><input type="checkbox" checked={reverseAck} disabled={busy} aria-invalid={invalid && !reverseAck} onChange={e => { setReverseAck(e.target.checked); setInvalid(false); }} />{t("directMoney.reverseAck")}</label>{invalid ? <p className={styles.error} role="alert">{t("directMoney.error.required")}</p> : null}<button className={styles.danger} disabled={busy || loading || refreshRequired} onClick={() => void act("reverse")}><RotateCcw size={16} />{t("directMoney.reverse")}</button></details></section> : null}
      {row.reversed_at ? <p>{date(row.reversed_at, true)} · {row.reversal_reason}</p> : null}
      <section className={styles.section}><details><summary>{t("directMoney.audit")}</summary>{audit.map(event => <p key={event.id}>{t(`directMoney.${event.event_type}`)} · {date(event.created_at, true)} · v{event.version}</p>)}</details></section>
      <DetailModal open={open} title={t("directMoney.edit")} onClose={() => { if (!busy) setOpen(false); }} closeOnBackdrop={false}><DirectMoneyForm key={row.version} id={id} initial={row.input_json} version={row.version} onBusy={setBusy} onSaved={() => { setOpen(false); void load(); }} /></DetailModal>
      <DetailModal open={classifyOpen} title={t("directMoney.classify")} onClose={() => { if (!busy) setClassifyOpen(false); }} closeOnBackdrop={false}><DirectMoneyClassification key={row.version} record={row} onBusy={setBusy} onSaved={() => { setClassifyOpen(false); void load(); }} /></DetailModal>
    </> : null}
  </main>;
}
