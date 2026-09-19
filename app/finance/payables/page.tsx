"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, RotateCcw } from "lucide-react";
import { Callout, EmptyState, FieldGroup, FilterToolbar, PageHeader, PageShell } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { QuotationGuard } from "../quotations/shared";
import FinanceSubNav from "../FinanceSubNav";
import { initialPayableFilters, payableQueueSummary, type PayableGroup, type PayablePage } from "./shared";
import styles from "./payables.module.css";
import { PayableGroups } from "./groups";
export { PayableGroups };
import { MultiSourcePayables } from "./multi-source";

export default function PayablesPage() {
  return <QuotationGuard canAccess={() => true}>
    {access => <><FinanceSubNav activePage="payables" permissions={access.permissions} /><PayablesAccess canReadRevenue={access.permissions.canViewFinancePayments} isAdmin={access.permissions.role === "admin"} /></>}
  </QuotationGuard>;
}

function PayablesAccess({ canReadRevenue, isAdmin }: { canReadRevenue: boolean; isAdmin: boolean }) {
 const { t } = useI18n(), [allowed, setAllowed] = useState<boolean | null>(null), [failed, setFailed] = useState(false);
 useEffect(() => { let live = true; void supabase.rpc("get_finance_expense_access").then(({ data, error }) => {
  if (!live) return; if (error || typeof data?.can_view_all !== "boolean") setFailed(true); else setAllowed(data.can_view_all);
 }); return () => { live = false; }; }, []);
 if (failed) return <Callout tone="negative" role="alert">{t("expenses.failed")}</Callout>;
 if (allowed === null) return <p role="status">{t("expenses.loading")}</p>;
 if (!allowed && !canReadRevenue) return <Callout tone="warning">{t("expenses.denied")}</Callout>;
 return <MultiSourcePayables canReadRevenue={canReadRevenue} canReadExpense={allowed} isAdmin={isAdmin} />;
}

export function PayablesWorkspace() {
  const { t, locale } = useI18n();
  const [filters, setFilters] = useState(initialPayableFilters), [offset, setOffset] = useState(0);
  const [data, setData] = useState<PayablePage | null>(null), [loading, setLoading] = useState(true), [failed, setFailed] = useState(false);
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const load = useCallback(async () => {
    const request = ++sequence.current; setLoading(true); setFailed(false); setData(null);
    try {
      // The existing read RPC is paginated. Complete the filtered read before showing queue totals.
      const groups: PayableGroup[] = [];
      let next = true;
      for (let start = 0; next; start += 25) {
        const result = await supabase.rpc("get_finance_payable_entitlements", { p_search: filters.search, p_source_type: filters.source, p_bucket: filters.bucket, p_status: filters.status, p_offset: start });
        if (request !== sequence.current) return;
        if (result.error || !Array.isArray(result.data?.groups) || typeof result.data?.has_next !== "boolean" || (result.data.has_next && result.data.groups.length !== 25)) throw result.error || new Error("response");
        groups.push(...result.data.groups as PayableGroup[]);
        next = result.data.has_next;
      }
      if (request === sequence.current) setData({ groups, has_next: false });
    } catch { if (request === sequence.current) setFailed(true); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [filters]);
  useEffect(() => { const timer = setTimeout(() => void load(), 150); return () => { clearTimeout(timer); invalidate(); }; }, [load, invalidate]);
  function change(patch: Partial<typeof filters>) { sequence.current++; setLoading(true); setData(null); setFilters(previous => ({ ...previous, ...patch })); setOffset(0); }
  const summary = data ? payableQueueSummary(data.groups) : null;
  const visibleGroups = data?.groups.slice(offset, offset + 25) || [];
  const hasNext = !!data && offset + 25 < data.groups.length;
  return <PageShell>
    <div className={styles.breadcrumb}><span>{t("common.nav.finance")}</span><ChevronRight size={14} aria-hidden="true" /><span>{t("payables.title")}</span></div>
    <div className={styles.queueHeader}><PageHeader title={t("payables.title")} description={t("payables.boundary")} />
      <dl className={styles.summary} aria-label={t("payables.title")}><div><dt>{t("payables.total")}</dt><dd>{summary ? summary.amounts.length ? summary.amounts.map(value => <span key={value.currency}>{value.amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {value.currency}</span>) : "0.00" : "-"}</dd></div><div><dt>{t("payables.recipients")}</dt><dd>{summary ? t("payables.peopleCount", { count: summary.recipients }) : "-"}</dd></div><div><dt>{t("payables.rights")}</dt><dd>{summary ? t("payables.rightsCount", { count: summary.components }) : "-"}</dd></div></dl>
    </div>
    {Object.entries(filters).some(([key, value]) => value !== initialPayableFilters[key as keyof typeof filters]) ? <p className={styles.muted}>{t("payables.filtered")}</p> : null}
    <FilterToolbar label={t("payables.filters")}>
      <FieldGroup className={styles.filter} id="payables-search" label={t("payables.search")}><input type="search" maxLength={200} value={filters.search} onChange={event => change({ search: event.target.value })} /></FieldGroup>
      {([['source', ['all', 'payment', 'direct_money_receipt']], ['bucket', ['all', 'referral', 'work']], ['status', ['open', 'settled', 'superseded', 'all']]] as const).map(([key, options]) =>
        <FieldGroup className={styles.filter} key={key} id={`payables-${key}`} label={t(`payables.${key}`)}><select value={filters[key]} onChange={event => change({ [key]: event.target.value })}>{options.map(option => <option value={option} key={option}>{t(option === "settled" ? "payout.settled" : `payables.${option}`)}</option>)}</select></FieldGroup>)}
      <button type="button" className={ui.secondary} onClick={() => change(initialPayableFilters)}><RotateCcw size={16} aria-hidden="true" />{t("payables.reset")}</button>
    </FilterToolbar>
    {loading ? <p role="status">{t("common.state.loading")}</p> : failed ? <Callout tone="negative" role="alert">{t("payables.failed")} <button type="button" className={ui.secondary} onClick={() => void load()}>{t("common.actions.retry")}</button></Callout> : data?.groups.length ? <><PayableGroups groups={visibleGroups} /><p className={styles.muted}>{t("payables.shown", { count: visibleGroups.length })}</p></> : <EmptyState><span className={styles.emptyTitle}>{t("payables.empty")}</span><span className={styles.emptyHelp}>{t("payables.emptyHelp")}</span></EmptyState>}
    {offset > 0 || hasNext ? <div className={styles.pagination}><button className={ui.secondary} type="button" title={t("finance.receipt.previous")} aria-label={t("finance.receipt.previous")} disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}><ArrowLeft size={18} /></button><span>{t("finance.receipt.page", { page: offset / 25 + 1 })}</span><button className={ui.secondary} type="button" title={t("finance.receipt.next")} aria-label={t("finance.receipt.next")} disabled={loading || failed || !hasNext} onClick={() => setOffset(offset + 25)}><ArrowRight size={18} /></button></div> : null}
  </PageShell>;
}
