"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Callout, Disclosure, EmptyState, FieldGroup, FilterToolbar, MoneySummary, PageHeader, PageShell, ReadOnlyGrid, SourceBadge, StatusBadge } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { QuotationGuard } from "../quotations/shared";
import FinanceSubNav from "../FinanceSubNav";
import { initialPayableFilters, payableGroupKey, payableRoleLabel, payableSourceHref, type PayableGroup, type PayablePage } from "./shared";
import styles from "./payables.module.css";

export default function PayablesPage() {
  return <QuotationGuard canAccess={access => access.permissions.canViewFinancePayments}>
    {access => <><FinanceSubNav activePage="payables" permissions={access.permissions} /><PayablesWorkspace /></>}
  </QuotationGuard>;
}

export function PayableGroups({ groups }: { groups: PayableGroup[] }) {
  const { t, locale, date } = useI18n();
  return <div className={styles.groups}>{groups.map(group => <article className={styles.group} key={payableGroupKey(group)} data-recipient={payableGroupKey(group)}>
    <div className={styles.groupHeading}><div><h2>{group.recipient_name}</h2><span className={styles.muted}>{t("payables.user")}</span>
      <div className={styles.sources}>{[...new Set(group.components.map(row => row.source_type))].map(source => <SourceBadge key={source} label={t(`payables.${source}`)} />)}</div></div>
      <MoneySummary className={styles.total} locale={locale} currency={group.currency} items={[{ key: "open", label: t("payables.openAmount"), amount: group.open_amount, emphasis: true }]} />
    </div>
    <Disclosure title={t(group.components.length === 1 ? "payables.oneComponent" : "payables.count", { count: group.components.length })}>
      {group.components.map(row => <section className={styles.component} key={row.id}>
        <div className={styles.componentHeading}><h3>{payableRoleLabel(row.role_label, locale)}</h3><StatusBadge status={row.status} label={t(`payables.${row.status}`)} /></div>
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
    </Disclosure>
  </article>)}</div>;
}

export function PayablesWorkspace() {
  const { t } = useI18n();
  const [filters, setFilters] = useState(initialPayableFilters), [offset, setOffset] = useState(0);
  const [data, setData] = useState<PayablePage | null>(null), [loading, setLoading] = useState(true), [failed, setFailed] = useState(false);
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const load = useCallback(async () => {
    const request = ++sequence.current; setLoading(true); setFailed(false); setData(null);
    try {
      const result = await supabase.rpc("get_finance_payable_entitlements", { p_search: filters.search, p_source_type: filters.source, p_bucket: filters.bucket, p_status: filters.status, p_offset: offset });
      if (result.error || !Array.isArray(result.data?.groups) || typeof result.data?.has_next !== "boolean") throw result.error || new Error("response");
      if (request === sequence.current) setData(result.data as PayablePage);
    } catch { if (request === sequence.current) setFailed(true); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [filters, offset]);
  useEffect(() => { const timer = setTimeout(() => void load(), 150); return () => { clearTimeout(timer); invalidate(); }; }, [load, invalidate]);
  function change(patch: Partial<typeof filters>) { sequence.current++; setLoading(true); setData(null); setFilters(previous => ({ ...previous, ...patch })); setOffset(0); }
  function page(next: number) { sequence.current++; setData(null); setLoading(true); setOffset(next); }
  return <PageShell>
    <PageHeader title={t("payables.title")} description={t("payables.boundary")} />
    <FilterToolbar label={t("payables.filters")}>
      <FieldGroup className={styles.filter} id="payables-search" label={t("payables.search")}><input type="search" maxLength={200} value={filters.search} onChange={event => change({ search: event.target.value })} /></FieldGroup>
      {([['source', ['all', 'payment', 'direct_money_receipt']], ['bucket', ['all', 'referral', 'work']], ['status', ['open', 'superseded', 'all']]] as const).map(([key, options]) =>
        <FieldGroup className={styles.filter} key={key} id={`payables-${key}`} label={t(`payables.${key}`)}><select value={filters[key]} onChange={event => change({ [key]: event.target.value })}>{options.map(option => <option value={option} key={option}>{t(`payables.${option}`)}</option>)}</select></FieldGroup>)}
    </FilterToolbar>
    {loading ? <p role="status">{t("common.state.loading")}</p> : failed ? <Callout tone="negative" role="alert">{t("payables.failed")} <button type="button" className={ui.secondary} onClick={() => void load()}>{t("common.actions.retry")}</button></Callout> : data?.groups.length ? <PayableGroups groups={data.groups} /> : <EmptyState><span className={styles.emptyTitle}>{t("payables.empty")}</span><span className={styles.emptyHelp}>{t("payables.emptyHelp")}</span></EmptyState>}
    {offset > 0 || data?.has_next ? <div className={styles.pagination}><button className={ui.secondary} type="button" title={t("finance.receipt.previous")} aria-label={t("finance.receipt.previous")} disabled={loading || offset === 0} onClick={() => page(Math.max(0, offset - 25))}><ArrowLeft size={18} /></button><span>{t("finance.receipt.page", { page: offset / 25 + 1 })}</span><button className={ui.secondary} type="button" title={t("finance.receipt.next")} aria-label={t("finance.receipt.next")} disabled={loading || failed || !data?.has_next} onClick={() => page(offset + 25)}><ArrowRight size={18} /></button></div> : null}
  </PageShell>;
}
