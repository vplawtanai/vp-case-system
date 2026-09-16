"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { Callout, Disclosure, EmptyState, FieldGroup, FilterToolbar, MoneySummary, PageHeader, PageShell, ReadOnlyGrid, SourceBadge, StatusBadge } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { QuotationGuard } from "../quotations/shared";
import FinanceSubNav from "../FinanceSubNav";
import { initialPayableFilters, payableGroupKey, payableQueueSummary, payableRoleLabel, payableSourceHref, type PayableGroup, type PayablePage } from "./shared";
import styles from "./payables.module.css";
import { payoutHref } from "../payouts/shared";

export default function PayablesPage() {
  return <QuotationGuard canAccess={access => access.permissions.canViewFinancePayments}>
    {access => <><FinanceSubNav activePage="payables" permissions={access.permissions} /><PayablesWorkspace /></>}
  </QuotationGuard>;
}

export function PayableGroups({ groups }: { groups: PayableGroup[] }) {
  const { t, locale, date } = useI18n();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return <div className={styles.groups}>{groups.map(group => <article className={styles.group} key={payableGroupKey(group)} data-recipient={payableGroupKey(group)}>
    <div className={styles.groupHeading}>
      <div className={styles.identity}><span className={styles.avatar} aria-hidden="true">{Array.from(group.recipient_name.trim())[0]}</span><div><h2>{group.recipient_name}</h2><SourceBadge label={t(group.components[0]?.recipient_type === "payee" ? "payout.external" : "payables.user")} /></div></div>
      <div className={styles.recipientAmount}><MoneySummary className={styles.total} locale={locale} currency={group.currency} items={[{ key: "open", label: t("payables.openAmount"), amount: group.open_amount, emphasis: true }]} /><span className={styles.muted}>{t(group.components.length === 1 ? "payables.oneComponent" : "payables.count", { count: group.components.length })}</span></div>
      <div className={styles.recipientActions}><Link className={ui.primary} href={payoutHref(group.recipient_id)}>{t("payables.pay")}<ArrowRight size={16} aria-hidden="true" /></Link>
        <button type="button" className={ui.secondary} aria-expanded={!!expanded[payableGroupKey(group)]} aria-controls={`payable-details-${payableGroupKey(group)}`} onClick={() => setExpanded(previous => ({ ...previous, [payableGroupKey(group)]: !previous[payableGroupKey(group)] }))}>{t(expanded[payableGroupKey(group)] ? "payables.hideDetails" : "payables.details")}<ChevronDown size={16} aria-hidden="true" /></button></div>
    </div>
    <table className={styles.breakdown}><caption className={styles.srOnly}>{t("payables.breakdown")}: {group.recipient_name}</caption><thead><tr><th>{t("payables.bucket")}</th><th>{t("payables.reference")}</th><th>{t("payables.earnedAt")}</th><th>{t("payables.amount")}</th></tr></thead><tbody>{group.components.map(row => <tr key={row.id}>
      <td data-label={t("payables.bucket")}><span>{payableRoleLabel(row.role_label, locale)}</span>{row.status !== "open" ? <StatusBadge status={row.status} label={t(row.status === "settled" ? "payout.settled" : `payables.${row.status}`)} /> : null}</td>
      <td data-label={t("payables.reference")}><Link href={payableSourceHref(row)}><span>{t(`payables.${row.source_type}`)}</span><small>{row.received_money_id.slice(0, 8).toUpperCase()}</small></Link></td>
      <td data-label={t("payables.earnedAt")}>{date(row.finalized_at)}</td><td data-label={t("payables.amount")} className={styles.lineAmount}><span>{row.gross_amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small>{row.currency}</small></span></td>
    </tr>)}</tbody></table>
    <div id={`payable-details-${payableGroupKey(group)}`} hidden={!expanded[payableGroupKey(group)]}>
      {group.components.map(row => <section className={styles.component} key={row.id}>
        <div className={styles.componentHeading}><h3>{payableRoleLabel(row.role_label, locale)}</h3><StatusBadge status={row.status} label={t(row.status === "settled" ? "payout.settled" : `payables.${row.status}`)} /></div>
        <ReadOnlyGrid items={[
          { key: "bucket", label: t("payables.bucket"), value: t(`payables.${row.bucket}`) },
          { key: "name", label: t("payables.frozenName"), value: row.recipient_name },
          { key: "source", label: t("payables.source"), value: <Link href={payableSourceHref(row)}>{t(`payables.${row.source_type}`)} · {row.received_money_id.slice(0, 8).toUpperCase()}<ArrowRight size={14} aria-hidden="true" /></Link> },
          { key: "line", label: t("payables.sourceLine"), value: row.evidence_json.line?.description || "-" },
          { key: "finalized", label: t("payables.finalized"), value: date(row.finalized_at, true) },
          { key: "distribution", label: t("payables.distribution"), value: `${row.distribution_id.slice(0, 8).toUpperCase()} · ${t("payables.revision", { revision: row.distribution_revision, version: row.distribution_version })}` },
          { key: "formula", label: t("payables.formula"), value: `${row.formula_code} v${row.formula_version} · ${t("payables.component", { number: row.component_no })}` },
        ]} />
        <MoneySummary locale={locale} currency={row.currency} items={[{ key: "amount", label: t("payables.amount"), amount: row.gross_amount, emphasis: true }]} />
        <Disclosure title={t("payables.technical")}><pre className={styles.technical}>{JSON.stringify(row, null, 2)}</pre></Disclosure>
      </section>)}
    </div>
  </article>)}</div>;
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
