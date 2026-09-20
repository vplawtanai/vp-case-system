"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Disclosure, MoneySummary, ReadOnlyGrid, SourceBadge, StatusBadge } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { payableGroupKey, payableRoleLabel, payableSourceHref, type PayableGroup } from "./shared";
import { payoutHref } from "../payouts/shared";
import styles from "./payables.module.css";
import { PayableSourceBadge, RecipientAvatar } from "./source-identity";
import { WorkflowDate } from "../workflow-time-ui";

export function PayableGroups({ groups, isAdmin = false }: { groups: PayableGroup[]; isAdmin?: boolean }) {
  const { t, locale, date } = useI18n();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return <div className={styles.groups}>{groups.map(group => <article className={styles.group} key={payableGroupKey(group)} data-recipient={payableGroupKey(group)}>
    <div className={styles.groupHeading}>
      <div className={styles.identity}><RecipientAvatar kind={group.components[0]?.recipient_type === "user" ? "person" : "payee"} /><div><h2>{group.recipient_name}</h2><div className={styles.identityBadges}><PayableSourceBadge source="revenue_distribution" /><SourceBadge label={t(group.components[0]?.recipient_type === "payee" ? "payout.external" : "payables.user")} /></div></div></div>
      <div className={styles.recipientAmount}><MoneySummary className={styles.total} locale={locale} currency={group.currency} items={[{ key: "open", label: t("payables.openAmount"), amount: group.open_amount, emphasis: true }]} /><span className={styles.muted}>{t(group.components.length === 1 ? "payables.oneComponent" : "payables.count", { count: group.components.length })}</span></div>
      <div className={styles.recipientActions}><Link className={ui.primary} href={payoutHref(group.recipient_id)}>{t("payables.pay")}<ArrowRight size={16} aria-hidden="true" /></Link>
        <button type="button" className={ui.secondary} aria-expanded={!!expanded[payableGroupKey(group)]} aria-controls={`payable-details-${payableGroupKey(group)}`} onClick={() => setExpanded(previous => ({ ...previous, [payableGroupKey(group)]: !previous[payableGroupKey(group)] }))}>{t(expanded[payableGroupKey(group)] ? "payables.hideDetails" : "payables.details")}<ChevronDown size={16} aria-hidden="true" /></button></div>
    </div>
    <table className={styles.breakdown}><caption className={styles.srOnly}>{t("payables.breakdown")}: {group.recipient_name}</caption><thead><tr><th>{t("payables.bucket")}</th><th>{t("payables.reference")}</th><th>{t("expenses.readyToPay")}</th><th>{t("payables.amount")}</th></tr></thead><tbody>{group.components.map(row => <tr key={row.id}>
      <td data-label={t("payables.bucket")}><span>{payableRoleLabel(row.role_label, locale)}</span>{row.status !== "open" ? <StatusBadge status={row.status} label={t(row.status === "settled" ? "payout.settled" : `payables.${row.status}`)} /> : null}</td>
      <td data-label={t("payables.reference")}><Link href={payableSourceHref(row)}><span>{t(`payables.${row.source_type}`)}</span><small>{row.received_money_id.slice(0, 8).toUpperCase()}</small></Link></td>
      <td data-label={t("expenses.readyToPay")}><WorkflowDate value={{ event: "readyToPay", at: row.created_at || null }} /></td><td data-label={t("payables.amount")} className={styles.lineAmount}><span>{row.gross_amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small>{row.currency}</small></span></td>
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
        {isAdmin ? <Disclosure title={t("payables.technical")}><pre className={styles.technical}>{JSON.stringify(row, null, 2)}</pre></Disclosure> : null}
      </section>)}
    </div>
  </article>)}</div>;
}
