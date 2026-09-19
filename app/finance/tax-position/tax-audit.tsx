"use client";

import Link from "next/link";
import type { UserPermissions } from "../../../lib/permissions";
import { useI18n } from "../../../lib/i18n/provider";
import { ReadOnlyGrid } from "../../components/ui/patterns";
import { FinanceEvidence } from "../FinanceEvidence";
import type { DashboardData, summarizeDashboard } from "./dashboard-data";
import styles from "./dashboard.module.css";

// Reuse the dashboard's loaded evidence. Opening audit never starts a write workflow.
export function TaxAudit({ permissions, data, summary, month }: {
 permissions: UserPermissions; data: DashboardData; summary: ReturnType<typeof summarizeDashboard>; month: string;
}) {
 const { t, locale, date } = useI18n(), tr = (key: string) => t(`taxDashboard.${key}`);
 if (permissions.role !== "admin") return null;
 const money = (value: number | null) => value === null ? tr("unavailable") : `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
 const period = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${month}-01T00:00:00+07:00`));
 const facts = data.register?.facts.filter(f => f.period_month === `${month}-01`);
 const pending = data.register?.pending_sources.filter(s => s.effective_on.slice(0, 7) === month);
 return <div className={styles.audit}>
  <section><h3>{tr("auditMonthly")} · {period}</h3><ReadOnlyGrid items={[
   { key: "vat", label: tr("output"), value: money(summary.outputVat) },
   { key: "input", label: tr("input"), value: tr("inputIncomplete") },
   { key: "net", label: tr("net"), value: t("taxPosition.unknown") },
   { key: "wht", label: tr("incoming"), value: money(summary.wht) },
   { key: "outgoing", label: tr("outgoing"), value: money(summary.outgoingDue) },
  ]} /><p>{tr("creditNotCash")}</p></section>
  <section><h3>{tr("auditSources")}</h3><p>{tr("auditSourcesHelp")}</p>
   <ReadOnlyGrid items={[
    { key: "registered", label: tr("registeredFacts"), value: facts?.length ?? tr("unavailable") },
    { key: "pending", label: tr("unregisteredSources"), value: pending?.length ?? tr("unavailable") },
   ]} />
   <ul className={styles.auditSources}>{summary.movements.map(m => <li key={m.key}>
    <div><Link href={m.href}>{m.reference}</Link><span>{tr(m.source)} · {date(m.date)}</span></div>
    <span>{tr("vatAmount")}: {m.vat === null ? tr("notEstablished") : money(m.vat)}</span>
   </li>)}</ul>
   {!summary.movements.length ? <p>{data.money && data.taxes ? tr("emptyMovements") : tr("unavailable")}</p> : null}
   <FinanceEvidence title={t("taxPosition.technical")} isAdmin raw={{ period_month: `${month}-01`, registered_facts: facts, pending_sources: pending, period: summary.period }}>
    <p>{tr("auditSourcesHelp")}</p>
   </FinanceEvidence>
  </section>
  <section><h3>{t("taxPosition.history")}</h3><FinanceEvidence title={tr("auditHistory")} isAdmin raw={data.register?.history ?? null}>
   <p>{data.register ? t("taxFiling.sourceCount", { count: data.register.history.length }) : tr("unavailable")}</p>
   <p>{tr("auditHistoryScope")}</p>
  </FinanceEvidence></section>
 </div>;
}
