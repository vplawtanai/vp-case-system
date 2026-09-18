"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileText, RefreshCw, TriangleAlert } from "lucide-react";
import DetailModal from "../../../components/DetailModal";
import { Callout, Disclosure, FieldGroup, PageShell, ReadOnlyGrid, StatusBadge } from "../../../components/ui/patterns";
import ui from "../../../components/ui/vp-ui.module.css";
import { supabase } from "../../../../lib/supabase";
import { useI18n } from "../../../../lib/i18n/provider";
import type { UserPermissions } from "../../../../lib/permissions";
import { currentBangkokMonth, readMonthlyTaxSources, shiftMonth, summarizeMonthlyTaxFacts, type MonthlyTaxFacts } from "../dashboard-data";
import { locationKey, locationName, openingStart } from "../../treasury/shared";
import { activeFiling, filingBaseAmount, filingErrorKey, filingState, summarizeFilings, type Filing, type FilingData, type FilingPool } from "./shared";
import styles from "./filings.module.css";

type Selection = { pool: FilingPool; filing?: Filing; mode: "review" | "file" | "payment" | "cancel" | "cancelPayment"; readonly?: boolean };
export function TaxFilingWorkspace({ permissions }: { permissions: UserPermissions }) {
 const { t, locale, date } = useI18n(), tr = (k: string, values?: Record<string, string | number>) => t(`taxFiling.${k}`, values);
 const [month, setMonth] = useState(currentBangkokMonth), [data, setData] = useState<FilingData | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
 const [monthlyFacts, setMonthlyFacts] = useState<MonthlyTaxFacts | null>(null);
 const { canViewFinancePayments, canViewFinanceTaxInvoices, canViewFinanceReceipts } = permissions;
 const [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false), [selection, setSelection] = useState<Selection | null>(null);
 const [due, setDue] = useState(""), [dueEvidence, setDueEvidence] = useState(""), [externalDate, setExternalDate] = useState(""), [reference, setReference] = useState(""), [evidence, setEvidence] = useState(""), [ack, setAck] = useState(false), [accountKey, setAccountKey] = useState("");
 const sequence = useRef(0), lock = useRef(false), requestId = useRef(""), form = useRef<HTMLFormElement>(null), queuedHistory = useRef<string | null>(null);
 const load = useCallback(async () => {
  const n = ++sequence.current; setLoading(true); setData(null); setMonthlyFacts(null);
  try {
   const result = await supabase.rpc("get_finance_tax_filings", { p_month: `${month}-01` });
   if (result.error || !Array.isArray(result.data?.pools) || !Array.isArray(result.data?.filings) || !Array.isArray(result.data?.accounts) || !Array.isArray(result.data?.history)) throw result.error || new Error("response");
   const sources = await readMonthlyTaxSources(supabase, { canViewFinancePayments, canViewFinanceTaxInvoices, canViewFinanceReceipts } as UserPermissions, month);
   if (n === sequence.current) {
    const next = result.data as FilingData; setData(next); setMonthlyFacts(summarizeMonthlyTaxFacts(sources, month));
    if (queuedHistory.current) { const f = next.filings.find(f => f.id === queuedHistory.current); queuedHistory.current = null; if (f) setSelection({ pool: f.source_snapshot_json, filing: f, mode: "review", readonly: true }); }
   }
  } catch (e) { if (n === sequence.current) setError(filingErrorKey(e)); }
  finally { if (n === sequence.current) setLoading(false); }
 }, [month, canViewFinancePayments, canViewFinanceTaxInvoices, canViewFinanceReceipts]);
 const invalidate = useCallback(() => { sequence.current++; }, []);
 useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => { clearTimeout(timer); invalidate(); }; }, [load, invalidate]);
 const money = (value: number | null | undefined) => value == null ? tr("unknown") : `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
 const monthName = (m: string) => new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${m.slice(0, 7)}-01T00:00:00+07:00`));
 const months = [...new Set([month, ...Array.from({ length: 37 }, (_, i) => shiftMonth(currentBangkokMonth(), i - 24))])].sort().reverse();
 const summary = data ? summarizeFilings(data, monthlyFacts) : null;
 const issues = data ? [...new Map(data.pools.flatMap(p => p.issues).map(i => [i.code, i])).values()] : [];
 const issueTitle = (code: string) => tr(({ input_vat_incomplete: "inputReview", unclassified_wht: "classificationReview", source_evidence_incomplete: "sourceReview", legacy_filing_review: "previousFilingReview" } as Record<string, string>)[code] || code);
 const f = selection?.filing, r = f?.remittance, paymentMode = selection?.mode === "payment", cancellation = selection?.mode === "cancel" || selection?.mode === "cancelPayment";
 const selectedEvidence = f?.source_snapshot_json || selection?.pool;
 const reviewSources = [...new Map([...(selectedEvidence?.sources || []), ...(selectedEvidence?.review_sources || [])].map(s => [s.id, s])).values()];
 const account = r && paymentMode ? r.draft_snapshot_json.account : data?.accounts.find(a => locationKey(a) === accountKey);
 const after = account?.system_balance != null && f?.tax_amount != null ? Math.round((account.system_balance - f.tax_amount) * 100) / 100 : null;
 const openingBlock = paymentMode && r?.status === "draft" && (!account?.opening_id || account.system_balance === null);
 const cutoffBlock = paymentMode && r?.status === "draft" && account?.opening_as_of && r.paid_on < openingStart(account.opening_as_of);
 function changeMonth(value: string) { sequence.current++; setMonth(value); setData(null); setLoading(true); setSelection(null); setSaved(false); setError(null); }
 function open(pool: FilingPool, filing?: Filing, mode: Selection["mode"] = "review", readonly = false) {
  requestId.current = crypto.randomUUID(); setSelection({ pool, filing, mode, readonly }); setDue(""); setDueEvidence(""); setExternalDate(""); setReference(""); setEvidence(""); setAccountKey(""); setAck(false); setError(null); setSaved(false);
 }
 function close() { if (!lock.current) { setSelection(null); setError(null); } }
 async function execute(name: string, args: Record<string, unknown>) {
  if (lock.current) return; lock.current = true; setBusy(true); setError(null); setSaved(false);
  try { const result = await supabase.rpc(name, args); if (result.error) throw result.error; setSelection(null); setSaved(true); await load(); }
  catch (e) { setError(filingErrorKey(e)); }
  finally { lock.current = false; setBusy(false); }
 }
 function submit(e: React.FormEvent) {
  e.preventDefault(); if (!selection || busy || !data) return;
  if (!form.current?.reportValidity()) return;
  if (paymentMode && f) {
   if (r) { void execute("transition_finance_tax_remittance", { p_id: r.id, p_version: r.version, p_action: "confirmed", p_acknowledged: ack }); return; }
   if (!account) { setError("required"); return; }
   void execute("create_finance_tax_remittance", { p_id: requestId.current, p_filing_id: f.id, p_bank: account.bank_account_id, p_cash: account.cash_location_id, p_paid_on: externalDate, p_reference: reference.trim(), p_evidence: evidence.trim(), p_expected_account: account }); return;
  }
  if (selection.mode === "cancelPayment" && r) { void execute("transition_finance_tax_remittance", { p_id: r.id, p_version: r.version, p_action: "cancelled", p_acknowledged: ack }); return; }
  if (!f) { void execute("create_finance_tax_filing", { p_id: requestId.current, p_month: selection.pool.period_month, p_type: selection.pool.filing_type, p_expected_fingerprint: selection.pool.fingerprint, p_due_date: due || null, p_due_evidence: dueEvidence.trim() || null }); return; }
  void execute("transition_finance_tax_filing", { p_id: f.id, p_version: f.version, p_action: cancellation ? "cancelled" : selection.mode === "file" ? "filed" : "ready_for_review", p_filed_on: selection.mode === "file" ? externalDate : null, p_reference: reference.trim() || null, p_evidence: evidence.trim() || null, p_acknowledged: ack });
 }
 const checked = (label: string) => <label className={styles.check}><input type="checkbox" required checked={ack} disabled={busy} onChange={e => setAck(e.target.checked)} /><span>{tr(label)}</span></label>;
 const evidenceFields = <><FieldGroup id="filing-external-date" label={tr(paymentMode ? "paidOn" : "filedOn")}><input type="date" required value={externalDate} onChange={e => setExternalDate(e.target.value)} /></FieldGroup>
  <FieldGroup id="filing-reference" label={tr("reference")}><input required maxLength={300} value={reference} onChange={e => setReference(e.target.value)} /></FieldGroup>
  <FieldGroup id="filing-evidence" label={tr("evidence")}><textarea required maxLength={2000} value={evidence} onChange={e => setEvidence(e.target.value)} /></FieldGroup></>;
 return <PageShell className={styles.page}>
  <header className={styles.header}><div><h1>{tr("title")}</h1><p>{tr("subtitle")}</p></div><div className={styles.periodControl}><label htmlFor="filing-period">{tr("period")}</label><div className={styles.month}>
   <button type="button" className={ui.secondary} disabled={busy} title={t("taxDashboard.previousMonth")} aria-label={t("taxDashboard.previousMonth")} onClick={() => changeMonth(shiftMonth(month, -1))}><ChevronLeft size={18} /></button>
   <select id="filing-period" aria-label={tr("period")} value={month} disabled={busy} onChange={e => changeMonth(e.target.value)}>{months.map(m => <option key={m} value={m}>{monthName(m)}</option>)}</select>
   <button type="button" className={ui.secondary} disabled={busy} title={t("taxDashboard.nextMonth")} aria-label={t("taxDashboard.nextMonth")} onClick={() => changeMonth(shiftMonth(month, 1))}><ChevronRight size={18} /></button>
   <button type="button" className={ui.secondary} disabled={busy || loading} title={t("common.actions.retry")} aria-label={t("common.actions.retry")} onClick={() => { setError(null); void load(); }}><RefreshCw size={18} /></button>
  </div></div></header>
  {error && !selection ? <Callout tone="negative" role="alert">{tr(error)}</Callout> : null}{saved ? <p role="status">{tr("saved")}</p> : null}{loading ? <p role="status">{t("common.state.loading")}</p> : null}
  <div className={styles.cards} aria-busy={loading}>
   {[{ key: "net", value: money(summary?.vat?.tax_amount), help: "netHelp", icon: <FileText />, tone: "blue" },
    { key: "incoming", value: money(summary?.incomingWht), help: "creditShort", icon: <ArrowDownToLine />, tone: "green" },
    { key: "outgoing", value: money(summary?.outgoing), help: "outgoingHelp", icon: <FileText />, tone: "blue" },
    { key: "periodStatus", value: tr(summary?.status || "collecting"), help: summary?.status === "needs_review" ? "periodReviewHelp" : "periodHelp", icon: <Clock3 />, tone: "amber" }].map(c => <article className={styles.card} key={c.key} data-tone={c.tone}><span className={styles.icon} aria-hidden="true">{c.icon}</span><div><h2>{tr(c.key)}</h2>{c.key === "periodStatus" ? <div data-metric={c.key}><StatusBadge status={summary?.status === "complete" ? "confirmed" : "pending"} label={loading ? "…" : c.value} /></div> : <strong data-metric={c.key} data-unknown={c.value === tr("unknown")}>{loading ? "…" : c.value}</strong>}<p>{tr(c.help)}</p></div></article>)}
  </div>
  {data && summary ? <>
   <div className={styles.main}>
    <section className={`${styles.section} ${styles.filingSection}`} aria-labelledby="filings-title"><h2 id="filings-title">{tr("filings")}</h2>
     <table className={`${styles.table} ${styles.filingTable}`}><thead><tr>{["type", "due", "base", "amount", "status", "actions"].map(k => <th key={k} scope="col">{tr(k)}</th>)}</tr></thead><tbody>{summary.obligations.map(p => { const row = activeFiling(data, p.filing_type); return <tr key={p.filing_type}>
      <td data-label={tr("type")}><strong>{tr(p.filing_type)}</strong><small>{tr(p.filing_type === "vat" ? "vatDescription" : p.filing_type === "wht_natural" ? "naturalDescription" : "juristicDescription")}</small></td>
      <td data-label={tr("due")} className={styles.dueCell}>{row?.due_date ? date(row.due_date) : tr("dueUnknown")}</td><td data-label={tr("base")}><span>{money(row?.status === "filed" ? row.base_amount : filingBaseAmount(p))}</span>{p.filing_type === "vat" && row?.status !== "filed" ? <small>{tr("outputKnown")}<b>{money(summary.outputVat)}</b></small> : null}</td>
      <td data-label={tr("amount")} className={styles.money}>{money(row?.status === "filed" ? row.tax_amount : p.tax_amount)}</td>
      <td data-label={tr("status")}><StatusBadge status={!p.ready ? "pending" : row?.status === "filed" ? "confirmed" : "draft"} label={tr(filingState(row, p))} />{!p.ready && row?.status !== "filed" ? <small className={styles.blockedReason}>{p.issues[0] ? issueTitle(p.issues[0].code) : tr("notReady")}</small> : null}</td>
      <td><button type="button" className={ui.secondary} onClick={() => open(p, row)}>{tr("review")}</button></td>
     </tr>; })}</tbody></table>
     {summary.outgoing === 0 ? <p className={styles.noLiability}><CheckCircle2 size={16} aria-hidden="true" />{tr("noWht")}</p> : null}
    </section>
    <section className={`${styles.section} ${styles.issueSection}`} aria-labelledby="filing-issues"><h2 id="filing-issues">{tr("issues")}</h2><ul className={styles.issues}>
     {issues.map(i => <li key={i.code}><TriangleAlert size={20} aria-hidden="true" /><div><strong>{issueTitle(i.code)}</strong><p>{tr(i.code)}</p>{i.count !== null ? <small>{tr("count", { count: i.count })}</small> : null}</div><div className={styles.issueAction}><StatusBadge status="pending" label={tr(i.code === "input_vat_incomplete" ? "incomplete" : "needs_review")} /><button type="button" className={styles.linkButton} onClick={() => { const p = data.pools.find(p => p.issues.some(x => x.code === i.code))!; open(p, activeFiling(data, p.filing_type)); }}>{tr("review")}<ArrowRight size={16} /></button></div></li>)}
     {!data.pools.some(p => p.filing_type !== "vat" && p.issues.length) ? <li data-ok><CheckCircle2 size={20} aria-hidden="true" /><div><strong>{tr(summary.outgoing ? "whtReviewed" : "noWhtTitle")}</strong><p>{tr(summary.outgoing ? "outgoingHelp" : "noWht")}</p></div></li> : null}
    </ul></section>
   <aside className={styles.summary} aria-labelledby="filing-summary"><h2 id="filing-summary">{tr("summary")}</h2><dl>
    <div><dt>{tr("output")}</dt><dd>{money(summary.outputVat)}</dd></div>
    <div><dt>{tr("input")}</dt><dd className={styles.warningText}>{tr("incomplete")}</dd></div>
    <div className={styles.netRow}><dt>{tr("net")}</dt><dd>{money(summary.vat?.tax_amount)}</dd></div>
   </dl><div className={styles.creditGroup}><dl><div><dt>{tr("incoming")}</dt><dd>{money(summary.incomingWht)}</dd></div></dl><p>{tr("creditHelp")}</p></div><dl>
    {data.pools.filter(p => p.filing_type !== "vat").map(p => <div key={p.filing_type}><dt>{tr(p.filing_type)}</dt><dd>{money(p.tax_amount)}</dd></div>)}
    <div className={styles.total}><dt>{tr("total")}</dt><dd>{summary.total === null ? tr("totalUnknown") : money(summary.total)}</dd></div>
   </dl><div className={styles.readiness}><h3>{tr("checklist")}</h3><ul className={styles.checklist}>
    {issues.map(i => <li key={i.code}><TriangleAlert size={17} aria-hidden="true" /><span>{issueTitle(i.code)}</span></li>)}
    {!data.pools.some(p => p.filing_type !== "vat" && p.issues.length) ? <li data-ok><CheckCircle2 size={17} aria-hidden="true" /><span>{tr(summary.outgoing ? "whtReviewed" : "noWht")}</span></li> : null}
   </ul><a className={styles.linkButton} href="#filing-issues">{tr("reviewChecklist")}<ArrowRight size={16} /></a></div><p className={styles.summaryFootnote}>{tr("externalOnly")}</p></aside>
   <section className={`${styles.section} ${styles.historySection}`} aria-labelledby="filing-history"><h2 id="filing-history">{tr("history")}</h2>
    {!data.history.length ? <div className={styles.emptyHistory}><Clock3 size={24} aria-hidden="true" /><div><strong>{tr("emptyHistory")}</strong><p>{tr("historyHelp")}</p></div></div> : <table className={styles.table}><thead><tr>{["type", "period", "filedOn", "amount", "status", "reference", "actions"].map(k => <th key={k} scope="col">{tr(k)}</th>)}</tr></thead><tbody>{data.history.map(h => <tr key={h.id}>
     <td data-label={tr("type")}>{tr(h.filing_type)}</td><td data-label={tr("period")}>{monthName(h.period_month)}</td><td data-label={tr("filedOn")}>{h.filed_on ? date(h.filed_on) : "-"}</td><td data-label={tr("amount")} className={styles.money}>{money(h.tax_amount)}</td>
     <td data-label={tr("status")}>{tr(h.payment_state)}</td><td data-label={tr("reference")}>{h.external_reference || "-"}</td><td><button type="button" className={styles.linkButton} onClick={() => { const found = data.filings.find(f => f.id === h.id); if (found) open(found.source_snapshot_json, found, "review", true); else { queuedHistory.current = h.id; changeMonth(h.period_month.slice(0, 7)); } }}>{tr("details")}<ArrowRight size={16} /></button></td>
    </tr>)}</tbody></table>}
   </section></div>
  </> : null}
  <DetailModal open={!!selection} title={selection ? `${tr(paymentMode ? "paymentReview" : cancellation ? "cancelDraft" : "review")} · ${tr(selection.pool.filing_type)}` : tr("review")} size="edit" onClose={close} closeOnBackdrop={!busy}>
   {selection && data ? <form ref={form} className={styles.form} onSubmit={submit} noValidate><fieldset disabled={busy}>
    <ReadOnlyGrid items={[{ key: "period", label: tr("period"), value: monthName(selection.pool.period_month) }, { key: "amount", label: tr("amount"), value: money(f ? f.tax_amount : selection.pool.tax_amount) },
     { key: "count", label: tr("base"), value: tr("sourceCount", { count: (f?.source_snapshot_json || selection.pool).source_count }) }, { key: "due", label: tr("due"), value: f?.due_date ? date(f.due_date) : tr("dueUnknown") }]} />
    {f?.source_changed ? <Callout tone="warning">{tr(f.status === "filed" ? "amendment" : "staleDraft")}</Callout> : null}
    {selection.mode === "review" ? <>
     {(f?.source_snapshot_json || selection.pool).issues.map(i => <Callout key={i.code} tone="warning">{tr(i.code)}</Callout>)}
     <div className={styles.sourceList}>{reviewSources.map(s => <article key={s.id}><strong>{s.payee_name || s.reference}</strong><p>{date(s.date)} · {tr("base")}: {money(s.base)} · {s.rate === null ? "-" : `${s.rate}%`} · {money(s.amount)}</p>
      {s.source_type === "payout" ? <p>{tr(s.entity_type === "natural_person" ? "wht_natural" : s.entity_type === "juristic_person" ? "wht_juristic" : "unclassified_wht")}</p> : null}
      {s.source_type === "payout" ? <Link href={`/finance/payouts/${s.source_id}`}>{s.reference}</Link> : null}
     </article>)}</div>
     {!f && data.can_manage ? <><FieldGroup id="filing-due" label={tr("due")} help={tr("dueHelp")}><input type="date" value={due} onChange={e => { setDue(e.target.value); if (!e.target.value) setDueEvidence(""); }} /></FieldGroup>
      {due ? <FieldGroup id="filing-due-evidence" label={tr("dueEvidence")}><textarea required maxLength={2000} value={dueEvidence} onChange={e => setDueEvidence(e.target.value)} /></FieldGroup> : null}<button className={ui.primary} type="submit">{tr("saveDraft")}</button></> : null}
     {f?.status === "draft" && data.can_manage && !selection.readonly ? <>{checked("reviewAck")}<button className={ui.primary} disabled={!selection.pool.ready || f.source_changed} type="submit">{tr("markReady")}</button></> : null}
     {f?.status === "ready_for_review" && data.can_manage && !selection.readonly ? <button className={ui.primary} type="button" disabled={f.source_changed || !selection.pool.ready} onClick={() => open(selection.pool, f, "file")}>{tr("recordFiled")}</button> : null}
     {f?.status === "filed" ? <><ReadOnlyGrid items={[{ key: "filed", label: tr("filedOn"), value: date(f.filed_on) }, { key: "ref", label: tr("reference"), value: f.external_reference }, { key: "evidence", label: tr("evidence"), value: f.filing_evidence }]} />
      {f.tax_amount === 0 ? <p>{tr("no_payment_required")}</p> : r?.status === "confirmed" ? <ReadOnlyGrid items={[{ key: "paid", label: tr("paidOn"), value: date(r.paid_on) }, { key: "cash", label: tr("paymentAmount"), value: money(r.amount) }, { key: "ref", label: tr("reference"), value: r.external_reference }]} />
       : data.can_remit && !selection.readonly ? <button type="button" className={ui.primary} onClick={() => open(selection.pool, f, "payment")}>{tr(r ? "paymentReview" : "payment")}</button> : null}</> : null}
     {f && ["draft", "ready_for_review"].includes(f.status) && data.can_manage && !selection.readonly ? <Disclosure title={tr("otherActions")}><button type="button" className={ui.secondary} onClick={() => open(selection.pool, f, "cancel")}>{tr("cancelDraft")}</button></Disclosure> : null}
     <Disclosure title={tr("technical")}><pre className={styles.technical}>{JSON.stringify(f || selection.pool, null, 2)}</pre></Disclosure>
    </> : null}
    {selection.mode === "file" ? <><Callout tone="warning">{tr("filingWarning")}</Callout>{evidenceFields}{checked("filingAck")}<button type="submit" className={ui.primary}>{tr("recordFiled")}</button></> : null}
    {paymentMode ? <><Callout tone="warning">{tr("paymentWarning")}</Callout>
     {!r ? <FieldGroup id="remittance-account" label={tr("account")}><select required value={accountKey} onChange={e => setAccountKey(e.target.value)}><option value="">{tr("selectAccount")}</option>{data.accounts.filter(a => a.is_active && a.currency === "THB").map(a => <option key={locationKey(a)} value={locationKey(a)}>{locationName(a, locale)}</option>)}</select></FieldGroup> : <p>{tr("account")}: {locationName(account, locale)}</p>}
     <ReadOnlyGrid items={[{ key: "before", label: tr("before"), value: money(account?.system_balance) }, { key: "paid", label: tr("paymentAmount"), value: money(f?.tax_amount) }, { key: "after", label: tr("after"), value: money(after) }]} /><p className={styles.muted}>{tr("balanceHelp")}</p>
     {after !== null && after < 0 ? <Callout tone="warning">{tr("negative")}</Callout> : null}
     {r ? <><ReadOnlyGrid items={[{ key: "date", label: tr("paidOn"), value: date(r.paid_on) }, { key: "ref", label: tr("reference"), value: r.external_reference }, { key: "evidence", label: tr("evidence"), value: r.payment_evidence }]} />
      {openingBlock || cutoffBlock ? <Callout tone="warning">{tr(openingBlock ? "openingRequired" : "beforeCutoff")}</Callout> : null}
      {checked("paymentAck")}<button className={ui.primary} type="submit" disabled={!!openingBlock || !!cutoffBlock}>{tr("confirmPayment")}</button>
      <Disclosure title={tr("otherActions")}><button type="button" className={ui.secondary} onClick={() => open(selection.pool, f, "cancelPayment")}>{tr("cancelDraft")}</button></Disclosure>
     </> : <>{evidenceFields}<button type="submit" className={ui.primary}>{tr("paymentDraft")}</button></>}
    </> : null}
    {cancellation ? <>{selection.mode === "cancel" ? <FieldGroup id="filing-cancel-reason" label={tr("reason")}><textarea required maxLength={2000} value={evidence} onChange={e => setEvidence(e.target.value)} /></FieldGroup> : null}{checked("cancelAck")}<button type="submit" className={ui.secondary}>{tr("cancelDraft")}</button></> : null}
    {error ? <Callout tone="negative" role="alert">{tr(error)}</Callout> : null}
   </fieldset></form> : null}
  </DetailModal>
 </PageShell>;
}
