"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Callout, EmptyState, FilterToolbar, PageHeader, PageShell, SourceBadge, StatusBadge } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { QuotationGuard } from "../quotations/shared";
import FinanceSubNav from "../FinanceSubNav";
import { money } from "../invoices/shared";
import { incomingStatuses, initialMoneyFilters, initialMoneyOffsets, readIncomingMoneyPage, type IncomingMoneyRow, type MoneyFilters, type MoneyOffsets, type MoneySource, type MoneyClassification } from "./incoming-money";
import styles from "../finance-record-list.module.css";
import listStyles from "./incoming-money.module.css";

export default function PaymentsPage() {
  return <QuotationGuard canAccess={access => access.permissions.canViewFinancePayments}>
    {access => <><FinanceSubNav activePage="payments" permissions={access.permissions} /><IncomingMoney canManage={access.profile?.role === "admin"} /></>}
  </QuotationGuard>;
}

export function IncomingMoney({ canManage = false }: { canManage?: boolean }) {
  const { t, date } = useI18n();
  const [filters, setFilters] = useState<MoneyFilters>(initialMoneyFilters);
  const [pages, setPages] = useState<MoneyOffsets[]>([initialMoneyOffsets]);
  const [rows, setRows] = useState<IncomingMoneyRow[]>([]);
  const [nextOffsets, setNextOffsets] = useState<MoneyOffsets | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const sequence = useRef(0), offsets = pages[pages.length - 1];
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const statuses = Object.fromEntries(incomingStatuses("all").map(status => [status, t(`incomingMoney.status.${status}`)]));
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setRows([]); setError(false); setNextOffsets(null);
    try {
      const result = await readIncomingMoneyPage(supabase, filters, offsets);
      if (request !== sequence.current) return;
      setRows(result.rows); setNextOffsets(result.hasNext ? result.nextOffsets : null);
    } catch { if (request === sequence.current) setError(true); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [filters, offsets]);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => { clearTimeout(timer); invalidate(); };
  }, [load, invalidate]);
  function changeFilters(patch: Partial<MoneyFilters>) {
    sequence.current++; setLoading(true); setRows([]); setNextOffsets(null);
    setFilters(previous => ({ ...previous, ...patch })); setPages([initialMoneyOffsets]);
  }
  function changePage(next: MoneyOffsets[]) { sequence.current++; setLoading(true); setRows([]); setNextOffsets(null); setPages(next); }
  const filtered = filters.source !== "all" || !!filters.status || filters.classification !== "all";
  const headings = ["reference", "payer", "date", "cash", "wht", "gross", "status", "open"].map(key => t(`incomingMoney.${key}`));
  return <PageShell className={listStyles.workspace}>
    <PageHeader title={t("finance.nav.payments")} actions={canManage ? <Link className={ui.primary} href="/finance/direct-money/new"><Plus size={16} aria-hidden="true" />{t("directMoney.create")}</Link> : null} />
    <FilterToolbar label={t("incomingMoney.filters")}>
      <label className={styles.filter}>{t("incomingMoney.source")}<select value={filters.source} onChange={event => {
        const source = event.target.value as MoneySource;
        changeFilters({ source, classification: "all", status: incomingStatuses(source).includes(filters.status) ? filters.status : "" });
      }}>{["all", "invoice", "direct"].map(source => <option value={source} key={source}>{t(`incomingMoney.source.${source}`)}</option>)}</select></label>
      <label className={styles.filter}>{t("incomingMoney.status")}<select value={filters.status} onChange={event => changeFilters({ status: event.target.value })}><option value="">{t("incomingMoney.all")}</option>{incomingStatuses(filters.source).map(status => <option value={status} key={status}>{statuses[status]}</option>)}</select></label>
      {filters.source === "direct" ? <label className={styles.filter}>{t("incomingMoney.classification")}<select value={filters.classification} onChange={event => changeFilters({ classification: event.target.value as MoneyClassification })}>{["all", "classified", "unclassified"].map(value => <option key={value} value={value}>{t(`incomingMoney.classification.${value}`)}</option>)}</select></label> : null}
    </FilterToolbar>
    {loading ? <p role="status">{t("common.state.loading")}</p> : error ? <Callout role="alert" tone="negative">{t("incomingMoney.failed")} <button className={styles.button} type="button" onClick={() => void load()}>{t("common.actions.retry")}</button></Callout> : !rows.length ?
      <EmptyState>{t(filtered ? "incomingMoney.filteredEmpty" : "incomingMoney.empty")}</EmptyState> :
      <table className={`${styles.table} ${listStyles.table}`}><caption className={listStyles.srOnly}>{t("finance.nav.payments")}</caption><colgroup>{["reference", "payer", "date", "amount", "amount", "amount", "status", "open"].map((key, i) => <col key={i} className={listStyles[`col${key}`]} />)}</colgroup><thead><tr>{headings.map((label, index) => <th key={index} scope="col" className={index >= 3 && index <= 5 ? styles.numeric : undefined}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={`${row.source}:${row.id}`}>
        <td data-label={headings[0]}><strong>{row.reference}</strong><div className={listStyles.badges}><SourceBadge label={t(`incomingMoney.source.${row.source}`)} />{row.unclassified === true ? <StatusBadge status="unclassified" label={t("incomingMoney.classification.unclassified")} /> : null}</div></td>
        <td data-label={headings[1]}>{row.payer || t("finance.list.customerUnavailable")}</td>
        <td data-label={headings[2]}>{date(row.receivedOn)}</td>
        <td data-label={headings[3]} className={styles.numeric}><strong>{money(row.cash, row.currency)}</strong></td>
        <td data-label={headings[4]} className={styles.numeric}>{money(row.wht, row.currency)}</td>
        <td data-label={headings[5]} className={styles.numeric}>{money(row.gross, row.currency)}</td>
        <td data-label={headings[6]}><StatusBadge status={row.status} label={statuses[row.status] || t("finance.receipt.invalidStatus")} /></td>
        <td data-label={headings[7]}><Link className={`${styles.button} ${listStyles.open}`} href={row.href} aria-label={`${headings[7]} ${row.reference}`}>{headings[7]}<ArrowRight size={14} aria-hidden="true" /></Link></td>
      </tr>)}</tbody></table>}
    <div className={styles.pagination}><button type="button" className={styles.button} disabled={loading || pages.length === 1} onClick={() => changePage(pages.slice(0, -1))}>{t("finance.receipt.previous")}</button><span>{t("finance.receipt.page", { page: pages.length })}</span><button type="button" className={styles.button} disabled={loading || error || !nextOffsets} onClick={() => nextOffsets && changePage([...pages, nextOffsets])}>{t("finance.receipt.next")}</button></div>
  </PageShell>;
}
