"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowRight, ChevronLeft, ChevronRight, Clock3, FileCheck2, FileText, Landmark, RefreshCw, Wallet, MoreHorizontal } from "lucide-react";
import DetailModal from "../../components/DetailModal";
import { Callout, PageShell, ReadOnlyGrid } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import type { UserPermissions } from "../../../lib/permissions";
import { locationName } from "../treasury/shared";
import { currentBangkokMonth, readDashboard, shiftMonth, summarizeDashboard, type DashboardData, type Movement } from "./dashboard-data";
import styles from "./dashboard.module.css";

export default function TaxDashboard({ permissions, taxDetails }: { permissions: UserPermissions; taxDetails: ReactNode }) {
 const { t, locale, date } = useI18n(), tr = (key: string, args?: Record<string, string | number>) => t(`taxDashboard.${key}`, args);
 const [month, setMonth] = useState(currentBangkokMonth), [data, setData] = useState<DashboardData | null>(null), [loading, setLoading] = useState(true), [updated, setUpdated] = useState<string | null>(null);
 const [selected, setSelected] = useState<Movement | null>(null), [details, setDetails] = useState(false), [showAll, setShowAll] = useState(false);
 const sequence = useRef(0), detailRef = useRef<HTMLDetailsElement>(null);
 const { canViewFinancePayments, canViewFinanceCashTransactions, canViewFinanceTaxInvoices, canViewFinanceReceipts } = permissions;
 const load = useCallback(async () => {
  const request = ++sequence.current; setLoading(true); setData(null);
  const result = await readDashboard(supabase, { canViewFinancePayments, canViewFinanceCashTransactions, canViewFinanceTaxInvoices, canViewFinanceReceipts } as UserPermissions, month);
  if (sequence.current === request) { setData(result); setUpdated(new Date().toISOString()); setLoading(false); }
 }, [month, canViewFinancePayments, canViewFinanceCashTransactions, canViewFinanceTaxInvoices, canViewFinanceReceipts]);
 const invalidate = useCallback(() => { sequence.current++; }, []);
 useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => { clearTimeout(timer); invalidate(); }; }, [load, invalidate]);
 const summary = useMemo(() => { try { return data ? summarizeDashboard(data, month) : null; } catch { return null; } }, [data, month]);
 const numeric = (value: number) => value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
 const money = (value: number | null | undefined) => value == null ? tr("unavailable") : `${numeric(value)} THB`;
 const monthName = (value: string) => new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${value}-01T00:00:00+07:00`));
 const months = [...new Set([month, ...Array.from({ length: 37 }, (_, i) => shiftMonth(currentBangkokMonth(), i - 24))])].sort().reverse();
 function changeMonth(value: string) { if (value === month) return; sequence.current++; setData(null); setMonth(value); setSelected(null); setShowAll(false); setLoading(true); }
 function openDetails() { setDetails(true); if (detailRef.current) { detailRef.current.open = true; detailRef.current.scrollIntoView({ block: "start", behavior: "smooth" }); detailRef.current.querySelector("summary")?.focus(); } }
 const missing = !loading && (!data?.money || !data?.taxes || !data?.treasury || !data?.payables || !data?.register || !summary);
 const gaps = (data?.register?.coverage.invoice_items_without_approved_tax_point || 0) + (data?.register?.coverage.unresolved_direct_sources || 0);
 const creditsToCheck = summary?.credits.filter(c => c.evidence !== "verified").length || 0;
 const rows = showAll ? summary?.movements || [] : summary?.movements.slice(0, 10) || [];
 const cards = [
  { key: "received", icon: <ArrowDownToLine />, tone: "green", value: summary?.cash, meta: tr("receivedCount", { count: summary?.receiptCount || 0 }), badge: data?.money ? tr("confirmed") : null },
  { key: "treasury", icon: <Landmark />, tone: "blue", value: summary?.systemBalance, meta: tr("systemNow"), badge: null },
  { key: "vat", icon: <FileText />, tone: "amber", value: summary?.outputVat, meta: tr("inputIncomplete"), badge: tr("purchaseReview") },
  { key: "wht", icon: <FileCheck2 />, tone: "green", value: summary?.wht, meta: tr("whtCount", { count: summary?.whtSources || 0 }), badge: null },
  { key: "payables", icon: <Wallet />, tone: "red", value: summary?.payable, meta: tr("recipients", { count: summary?.recipients || 0 }), badge: null },
 ];
 return <PageShell className={styles.dashboard}>
  <header className={styles.header}>
   <div className={styles.identity}><h1>{t("taxPosition.title")}</h1><p>{tr("subtitle")}</p></div>
   <div className={styles.month}><label htmlFor="tax-dashboard-month">{tr("month")}</label><select id="tax-dashboard-month" value={month} onChange={e => changeMonth(e.target.value)}>{months.map(m => <option key={m} value={m}>{monthName(m)}</option>)}</select>
    <button type="button" className={ui.secondary} aria-label={tr("previousMonth")} title={tr("previousMonth")} onClick={() => changeMonth(shiftMonth(month, -1))}><ChevronLeft size={18} /></button>
    <button type="button" className={ui.secondary} aria-label={tr("nextMonth")} title={tr("nextMonth")} onClick={() => changeMonth(shiftMonth(month, 1))}><ChevronRight size={18} /></button></div>
   <div className={styles.refresh}><span>{updated ? tr("updated", { date: date(updated, true) }) : tr("notLoaded")}</span><button type="button" className={ui.secondary} disabled={loading} onClick={() => void load()}><RefreshCw size={16} />{tr("refresh")}</button></div>
  </header>
  <p className={styles.scopeNote}>{tr("scope", { month: monthName(month) })}</p>
  {loading ? <p role="status">{t("common.state.loading")}</p> : null}
  {missing ? <Callout tone="warning" role="status">{tr("partialAccess")}</Callout> : null}
  <div className={styles.cards} aria-label={tr("summary")} aria-busy={loading}>{cards.map(c => <article className={`${styles.card} ${styles[c.tone]}`} key={c.key}>
   <div className={styles.cardTitle}><span className={styles.icon} aria-hidden="true">{c.icon}</span><h2>{tr(c.key)}</h2></div>
   <strong className={styles.amount} data-metric={c.key}>{loading ? "…" : money(c.value)}</strong>
   {c.badge ? <span className={styles.badge}>{c.badge}</span> : null}
   <p>{loading || c.value == null ? tr("notSummarized") : c.meta}</p>
   {c.key === "treasury" && summary?.accounts.length ? <small>{summary.accounts.filter(a => a.system_balance !== null).map(a => `${locationName(a, locale)} ${money(a.system_balance)}`).join(" · ")}{summary.unknownAccounts ? ` · ${tr("unopened", { count: summary.unknownAccounts })}` : ""}</small> : null}
   {c.key === "vat" ? <small>{tr("net")}: {t("taxPosition.unknown")}</small> : null}
   {c.key === "wht" ? <small>{tr("creditNotCash")}</small> : null}
  </article>)}</div>
  {gaps > 0 ? <div className={styles.notice}><span>{tr("coverage", { count: gaps })}</span><button type="button" onClick={openDetails}>{tr("taxDetails")}<ArrowRight size={14} /></button></div> : null}
  {summary?.unresolved && !gaps ? <p className={styles.notice}>{tr("coverage", { count: summary.unresolved })}</p> : null}
  {summary?.foreign ? <p className={styles.notice}>{tr("foreign", { count: summary.foreign })}</p> : null}
  <div className={styles.main}>
   <section className={styles.activity} aria-labelledby="tax-movements-title">
    <div className={styles.sectionHeading}><Clock3 size={23} aria-hidden="true" /><div><h2 id="tax-movements-title">{tr("movements")}</h2><p>{tr("movementsHelp")}</p></div>
     {(summary?.movements.length || 0) > 10 ? <button type="button" className={ui.secondary} onClick={() => setShowAll(v => !v)}>{tr(showAll ? "latestTen" : "allMovements")}<ArrowRight size={14} /></button> : null}</div>
    <table className={styles.table}><caption className={styles.srOnly}>{tr("movements")} · {monthName(month)}</caption><thead><tr>{["date", "source", "gross", "vatAmount", "whtAmount", "cash", "status", "open"].map(h => <th key={h} scope="col"><span className={h === "open" ? styles.srOnly : undefined}>{tr(h)}</span></th>)}</tr></thead><tbody>
     {rows.map(row => <tr key={row.key}>
      <td data-label={tr("date")}>{date(row.date)}</td><td data-label={tr("source")}><strong>{tr(row.source)}</strong><span className={styles.reference}>{row.reference}</span></td>
      <td data-label={tr("gross")}>{numeric(row.gross)}</td><td data-label={tr("vatAmount")}>{row.vat === null ? <span title={tr("vatNotEstablished")}>{tr("notEstablished")}</span> : numeric(row.vat)}</td>
      <td data-label={tr("whtAmount")}>{row.wht === null ? "-" : numeric(row.wht)}</td><td data-label={tr("cash")}>{row.cash === null ? <span>{tr("noCash")}</span> : numeric(row.cash)}</td>
      <td data-label={tr("status")}><span className={styles.status}>{tr(row.cash === null ? "documented" : "confirmed")}</span></td>
      <td><button type="button" className={styles.rowButton} aria-label={`${tr("open")} ${row.reference}`} title={tr("open")} onClick={() => setSelected(row)}><MoreHorizontal size={19} /></button></td>
     </tr>)}
     {!rows.length ? <tr><td colSpan={8} className={styles.empty}>{loading ? t("common.state.loading") : data?.money && data?.taxes ? tr("emptyMovements") : tr("unavailable")}</td></tr> : null}
    </tbody></table>
   </section>
   <section className={styles.monthEnd} aria-labelledby="tax-month-end-title">
    <div className={styles.sectionHeading}><FileText size={24} aria-hidden="true" /><div><h2 id="tax-month-end-title">{tr("monthEnd")}</h2><p>{tr("monthEndHelp")}</p></div></div>
    <dl className={styles.taxSummary}>
     <div><dt>{tr("output")}</dt><dd>{money(summary?.outputVat)}</dd></div>
     <div className={styles.warning}><dt>{tr("input")}</dt><dd>{tr("inputIncomplete")}</dd></div>
     <div className={styles.net}><dt>{tr("net")}</dt><dd>{t("taxPosition.unknown")}</dd></div>
     <div><dt>{tr("incoming")}</dt><dd>{money(summary?.wht)}</dd></div>
     <div><dt>{t("payout.outgoingHeld")}</dt><dd>{money(summary?.outgoingHeld)}</dd></div>
     <div><dt>{t("payout.outgoingDue")}</dt><dd>{money(summary?.outgoingDue)}</dd></div>
    </dl>
    <p className={styles.filing}>{tr("filingOnly")} {summary?.period ? t(`taxPosition.${summary.period.status}`) : tr("unreviewed")}</p>
    <div className={styles.checklistTitle}><h3>{tr("actions")}</h3><button type="button" onClick={openDetails}>{tr("taxDetails")}<ArrowRight size={14} /></button></div>
    <ol className={styles.checklist}>
     <li><span>{tr("purchaseAction")}</span><small className={styles.warning}>{tr("incomplete")}</small></li>
     {(summary?.credits.length || 0) > 0 ? <li><span>{tr("whtAction")}</span><small>{creditsToCheck ? tr("toReview", { count: creditsToCheck }) : tr("evidenceVerified")}</small></li> : null}
     <li><span>{tr("periodAction")}</span><small>{summary?.period ? t(`taxPosition.${summary.period.status}`) : tr("unreviewed")}</small></li>
    </ol>
   </section>
  </div>
  <section className={styles.moneyPosition} aria-labelledby="money-position-title">
   <div className={styles.sectionHeading}><Landmark size={23} aria-hidden="true" /><div><h2 id="money-position-title">{tr("moneyPosition")}</h2><p>{tr("moneyPositionHelp")}</p></div>
    {permissions.canViewFinanceCashTransactions ? <Link className={ui.secondary} href="/finance/treasury">{tr("openTreasury")}<ArrowRight size={14} /></Link> : null}</div>
   <div className={styles.accounts}>
    {summary?.accounts.map(a => <article className={styles.account} key={`${a.kind}:${a.account_id}`}><Landmark size={22} aria-hidden="true" /><div><h3>{locationName(a, locale)}</h3><strong>{money(a.system_balance)}</strong><small>{a.system_balance === null ? tr("openingRequired") : tr("systemNow")}</small></div></article>)}
    {!summary?.accounts.length ? <p className={styles.empty}>{tr("unavailable")}</p> : null}
    <article className={`${styles.account} ${styles.payableAccount}`}><Wallet size={22} aria-hidden="true" /><div><h3>{tr("payableRights")}</h3><strong>{money(summary?.payable)}</strong><small>{summary?.payable != null ? tr("recipients", { count: summary.recipients }) : tr("unavailable")}</small></div>{permissions.canViewFinancePayments ? <Link href="/finance/payables" aria-label={tr("openPayables")} title={tr("openPayables")}><ArrowRight size={19} /></Link> : null}</article>
   </div>
  </section>
  <details ref={detailRef} className={styles.details} onToggle={e => setDetails(e.currentTarget.open)}><summary>{tr("taxDetails")}</summary>{details ? taxDetails : null}</details>
  <DetailModal open={!!selected} title={selected ? `${tr(selected.source)} · ${selected.reference}` : tr("open")} size="edit" onClose={() => setSelected(null)}>
   {selected ? <><ReadOnlyGrid items={[
    { key: "date", label: tr("date"), value: date(selected.date) }, { key: "payer", label: tr("payer"), value: selected.payer || tr("notEstablished") },
    { key: "gross", label: tr("gross"), value: money(selected.gross) }, { key: "cash", label: tr("cash"), value: selected.cash === null ? tr("noCash") : money(selected.cash) },
    { key: "vat", label: tr("vatAmount"), value: selected.vat === null ? tr("vatNotEstablished") : money(selected.vat) }, { key: "wht", label: tr("whtAmount"), value: selected.wht === null ? "-" : money(selected.wht) },
   ]} />
    {summary?.credits.filter(c => c.sourceId === selected.id && c.source === selected.source).map(c => <div className={styles.credit} key={c.key}><ReadOnlyGrid items={[
     { key: "base", label: t("taxPosition.base"), value: c.base === null ? t("taxPosition.notRecorded") : money(c.base) }, { key: "rate", label: t("taxPosition.rate"), value: c.rate === null ? t("taxPosition.notRecorded") : `${c.rate}%` },
     { key: "credit", label: tr("incoming"), value: money(c.amount) }, { key: "evidence", label: t("taxPosition.status"), value: t(`taxPosition.${c.evidence}`) },
    ]} /></div>)}
    <p className={styles.scopeNote}>{tr("creditNotCash")}</p><Link className={ui.secondary} href={selected.href}>{tr("openSource")}<ArrowRight size={16} /></Link>
   </> : null}
  </DetailModal>
 </PageShell>;
}
