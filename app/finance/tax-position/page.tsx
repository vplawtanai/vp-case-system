"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import DetailModal from "../../components/DetailModal";
import { Callout, Disclosure, EmptyState, FieldGroup, PageHeader, PageShell, ReadOnlyGrid, StatusBadge } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { QuotationGuard } from "../quotations/shared";
import FinanceSubNav from "../FinanceSubNav";
import TaxModuleNav from "./module-nav";
import TaxDashboard from "./dashboard";
import { sourceLabel, taxErrorKey, type TaxFact, type TaxPositionData, type TaxSource } from "./shared";
import styles from "./tax-position.module.css";
import { FinanceEvidence } from "../FinanceEvidence";

type Action = { kind: "source"; row: TaxSource } | { kind: "evidence"; row: TaxFact };
export default function TaxPositionPage() {
 return <QuotationGuard canAccess={a => a.permissions.canViewFinanceTaxInvoices || a.profile?.role === "partner"}>
  {a => <><FinanceSubNav activePage="tax-position" permissions={a.permissions} /><TaxModuleNav active="overview" /><TaxDashboard permissions={a.permissions} /></>}
 </QuotationGuard>;
}
export function TaxPositionWorkspace({ isAdmin = false }: { isAdmin?: boolean }) {
 const { t, locale, date } = useI18n();
 const [data, setData] = useState<TaxPositionData | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
 const [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false), [action, setAction] = useState<Action | null>(null);
 const [status, setStatus] = useState(""), [reference, setReference] = useState(""), [ack, setAck] = useState(false), [invalid, setInvalid] = useState(false);
 const lock = useRef(false), request = useRef(0), referenceRef = useRef<HTMLTextAreaElement>(null), ackRef = useRef<HTMLInputElement>(null);
 const load = useCallback(async () => {
  const sequence = ++request.current; setLoading(true);
  try {
   const result = await supabase.rpc("get_finance_tax_position");
   if (result.error || !Array.isArray(result.data?.facts) || !Array.isArray(result.data?.periods) || !Array.isArray(result.data?.pending_sources)) throw result.error || new Error("response");
   if (sequence === request.current) setData(result.data);
  } catch (e) { if (sequence === request.current) { setData(null); setError(taxErrorKey(e)); } }
  finally { if (sequence === request.current) setLoading(false); }
 }, []);
 const invalidate = useCallback(() => { request.current++; }, []);
 useEffect(() => { void load(); return invalidate; }, [load, invalidate]);
 const amount = (n: number | null) => n === null ? t("taxPosition.notRecorded") : `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
 const month = (s: string) => new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${s}T00:00:00+07:00`));
 function open(next: Action) {
  setAction(next); setStatus("received");
  setReference(""); setAck(false); setInvalid(false); setError(null); setSaved(false);
 }
 function close() { if (!lock.current) { setAction(null); setError(null); setInvalid(false); } }
 async function submit(e: React.FormEvent) {
  e.preventDefault(); if (!action || lock.current) return;
  if (!reference.trim() || !ack) {
   setInvalid(true); setError("taxPosition.error.required");
   (!reference.trim() ? referenceRef.current : ackRef.current)?.focus(); return;
  }
  lock.current = true; setBusy(true); setError(null);
  try {
   const result = action.kind === "source"
    ? await supabase.rpc("materialize_finance_tax_source", { p_type: action.row.source_type, p_id: action.row.source_id, p_expected_source: action.row, p_acknowledged: ack, p_reason: reference.trim() })
    : await supabase.rpc("record_finance_incoming_wht_evidence", { p_fact_id: action.row.id, p_status: status, p_reference: reference.trim(), p_acknowledged: ack });
   if (result.error) throw result.error;
   setAction(null); setSaved(true); await load();
  } catch (e) { setError(taxErrorKey(e)); }
  finally { lock.current = false; setBusy(false); }
 }
 function fact(f: TaxFact) {
  return <article className={styles.row} key={f.id}>
   <div className={styles.heading}><strong>{t(`taxPosition.${f.source_type}`)} · {sourceLabel({ source_id: f.source_id, reference: f.document_reference })}</strong>
    {f.tax_kind === "incoming_wht" ? <StatusBadge status={f.evidence_status} label={t(`taxPosition.${f.evidence_status}`)} /> : null}</div>
   {f.payer_json.name ? <p>{f.payer_json.name}</p> : null}
   <ReadOnlyGrid items={[
    { key: "date", label: t("taxPosition.date"), value: date(f.effective_on) },
    { key: "base", label: t("taxPosition.base"), value: amount(f.base_amount) },
    { key: "rate", label: t("taxPosition.rate"), value: f.rate_percent === null ? t("taxPosition.notRecorded") : `${f.rate_percent}%` },
    { key: "tax", label: t("taxPosition.tax"), value: amount(f.tax_amount) },
   ]} />
   <p className={styles.muted}>{t(`taxPosition.${f.date_basis}`)}</p>
   {f.certificate_reference ? <p>{f.certificate_reference}</p> : null}
   {f.tax_kind === "incoming_wht" && data?.can_manage ? <button className={ui.secondary} type="button" disabled={busy} onClick={() => open({ kind: "evidence", row: f })}>{t("taxPosition.evidenceAction")}</button> : null}
   <FinanceEvidence title={t("taxPosition.technical")} raw={f} isAdmin={isAdmin}><ReadOnlyGrid items={[{ key: "period", label: t("taxFiling.period"), value: month(f.period_month) }, { key: "source", label: t("treasury.source"), value: t(`taxPosition.${f.source_type}`) }, { key: "tax", label: t("taxPosition.tax"), value: amount(f.tax_amount) }]} /></FinanceEvidence>
  </article>;
 }
 const title = t(`taxPosition.${action?.kind === "source" ? "materialize" : "evidenceAction"}`);
 return <PageShell>
  <PageHeader title={t("taxPosition.title")} actions={<button className={ui.secondary} type="button" aria-label={t("common.actions.retry")} title={t("common.actions.retry")} disabled={loading || busy} onClick={() => { setError(null); void load(); }}><RefreshCw size={18} /></button>} />
  <p className={styles.muted}>{t("taxPosition.boundary")}</p>
  {error && !action ? <Callout tone="negative" role="alert">{t(error)}</Callout> : null}
  {saved ? <p role="status">{t("taxPosition.saved")}</p> : null}
  {loading ? <p role="status">{t("common.state.loading")}</p> : null}
  {data ? <>
   <Callout tone="warning">{t("taxPosition.coverage", { invoice: data.coverage.invoice_items_without_approved_tax_point, direct: data.coverage.unresolved_direct_sources })}</Callout>
   <section className={styles.section}><h2>{t("taxPosition.vat")}</h2>
    <p className={styles.muted}>{t("taxPosition.filingHelp")}</p>
    {!data.periods.length ? <><EmptyState>{t("taxPosition.empty")}</EmptyState><ReadOnlyGrid items={[{ key: "input", label: t("taxPosition.input"), value: t("taxPosition.incomplete") }, { key: "net", label: t("taxPosition.net"), value: t("taxPosition.unknown") }]} /></> : data.periods.map(p => <div className={styles.period} key={p.period_month}>
     <div className={styles.heading}><h3>{month(p.period_month)}</h3><StatusBadge status={p.status} label={t(`taxPosition.${p.status}`)} /></div>
     <ReadOnlyGrid items={[{ key: "output", label: t("taxPosition.output"), value: amount(p.known_output_vat) }, { key: "input", label: t("taxPosition.input"), value: t("taxPosition.incomplete") }, { key: "net", label: t("taxPosition.net"), value: t("taxPosition.unknown") }]} />
     {p.filing_reference ? <p>{p.filing_reference} · {date(p.filed_on)}</p> : null}
     <Link className={ui.secondary} href="/finance/tax-position/filings">{t("taxFiling.title")}</Link>
     <Disclosure title={t("taxPosition.sources")}>{data.facts.filter(f => f.tax_kind === "output_vat" && f.period_month === p.period_month).map(fact)}</Disclosure>
     <Disclosure title={t("expenses.reviewedInput")}>{data.facts.filter(f => f.tax_kind === "input_vat" && f.period_month === p.period_month).map(fact)}</Disclosure>
    </div>)}
   </section>
   <section className={styles.section}><h2>{t("taxPosition.incoming")}</h2><p className={styles.muted}>{t("taxPosition.incomingHelp")}</p>
    <p>{t("taxPosition.total")}: <strong>{amount(data.incoming_wht_total)}</strong></p>
    {data.facts.filter(f => f.tax_kind === "incoming_wht").map(fact)}
   </section>
   <section className={styles.section}><h2>{t("taxPosition.outgoing")}</h2><p className={styles.muted}>{t("taxPosition.outgoingHelp")}</p>
    {!data.outgoing?.length ? <EmptyState>{t("taxPosition.empty")}</EmptyState> : data.outgoing.map(w => <article className={styles.row} key={w.id}><strong>{w.payee_name}</strong><p>{date(w.withheld_on)} · {w.rate}% · {amount(w.withheld_amount)}</p><p>{w.remittance_status === "remitted" ? t("taxFiling.remitted") : t("payout.notRemitted")}</p></article>)}
   </section>
   {data.can_materialize && data.pending_sources.length ? <section className={styles.section}><h2>{t("taxPosition.pending")}</h2>
    {data.pending_sources.map(s => <article className={styles.row} key={`${s.source_type}:${s.source_id}`}><div className={styles.heading}>
     <strong>{t(`taxPosition.${s.source_type}`)} · {sourceLabel(s)}</strong><span>{date(s.effective_on)}</span></div>
     {s.payer.name ? <p>{s.payer.name}</p> : null}
     {s.warnings.length ? <p className={styles.muted}>{t("taxPosition.incomplete")}</p> : null}
     <button className={ui.secondary} type="button" disabled={busy} onClick={() => open({ kind: "source", row: s })}>{t("taxPosition.materialize")}</button>
    </article>)}
   </section> : null}
   <FinanceEvidence title={t("taxPosition.history")} raw={data.history} isAdmin={isAdmin}><p>{t("taxFiling.sourceCount", { count: data.history.length })}</p></FinanceEvidence>
  </> : null}
  <DetailModal open={!!action} title={title} size="edit" onClose={close} closeOnBackdrop={!busy}>
   {action ? <form className={styles.form} noValidate onSubmit={submit}>
    <p>{t(action.kind === "evidence" ? "taxPosition.incomingHelp" : "taxPosition.boundary")}</p>
    {action.kind === "source" ? <><strong>{sourceLabel(action.row)}</strong>{action.row.lines.map((l, n) => <p key={n}>{t(l.kind === "output_vat" ? "taxPosition.output" : "taxPosition.incoming")}: {amount(l.tax)}</p>)}</> : null}
    {action.kind !== "source" ? <FieldGroup id="tax-status" label={t("taxPosition.status")}><select value={status} disabled={busy} onChange={e => { setStatus(e.target.value); setInvalid(false); }}>
     {["awaiting_evidence", "received", "verified"].map(s => <option key={s} value={s}>{t(`taxPosition.${s}`)}</option>)}
    </select></FieldGroup> : null}
    <FieldGroup id="tax-reference" label={t("taxPosition.reference")}><textarea ref={referenceRef} required maxLength={2000} value={reference} disabled={busy} aria-invalid={invalid && !reference.trim()} onChange={e => { setReference(e.target.value); setInvalid(false); setError(null); }} /></FieldGroup>
    <label className={styles.check}><input ref={ackRef} type="checkbox" checked={ack} disabled={busy} aria-invalid={invalid && !ack} onChange={e => { setAck(e.target.checked); setInvalid(false); setError(null); }} /><span>{t("taxPosition.ack")}</span></label>
    {error ? <Callout tone="negative" role="alert">{t(error)}</Callout> : null}
    <button type="submit" disabled={busy} className={ui.primary}>{t("taxPosition.save")}</button>
   </form> : null}
  </DetailModal>
 </PageShell>;
}
