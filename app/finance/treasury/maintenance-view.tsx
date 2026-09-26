"use client";
import Link from "next/link";
import { Disclosure } from "../../components/ui/patterns";
import { FinanceStatusBadge as StatusBadge } from "../ui/primitives";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { treasuryOverview } from "./dashboard";
import { locationKey, locationName, openingStart, sourceHref, type Location, type Opening, type TreasuryData, type TreasurySource } from "./shared";
import styles from "./treasury.module.css";

// Reuse the existing opening lineage, cutoff rules and receipt exception queue.
// Daily balances and activity now belong exclusively to Statement.
export function StatementMaintenanceView({ data, busy, onOpening, onMaterialize }: {
 data: TreasuryData; busy: boolean;
 onOpening: (account: Location, saved?: Opening | null, replace?: boolean) => void;
 onMaterialize: (source: TreasurySource) => void;
}) {
 const { t, locale, date } = useI18n(), overview = treasuryOverview(data);
 const accountFor = (row: { bank_account_id: string | null; cash_location_id: string | null }) => data.accounts.find(a => locationKey(a) === locationKey(row));
 const money = (n: number, currency: string) => `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
 if (!data.can_manage) return <p role="alert">{t("treasury.error.permission")}</p>;
 return <>
  <section className={styles.section}><p className={styles.muted}>{t("treasury.openingHelp")}</p><div className={styles.accounts}>{data.accounts.map(a => <article className={styles.accountCard} key={locationKey(a)}>
   <h2>{locationName(a, locale)}</h2><p>{a.opening_id ? `${t("statement.opening")}: ${money(a.opening_amount!, a.currency)} · ${date(openingStart(a.opening_as_of!))}` : t("treasury.unknown")}</p>
   {a.is_active ? <button className={ui.secondary} disabled={busy} onClick={() => onOpening(a, data.openings.find(o => o.status === "draft" && locationKey(o) === locationKey(a)) || null, !!a.opening_id)}>{t(a.opening_id ? "treasury.replacement" : "treasury.opening")}</button> : <p>{t("treasury.inactive")}</p>}
  </article>)}</div></section>
  <Disclosure title={t("treasury.openingHistory")}>{data.openings.map(o => <article className={styles.history} key={o.id}>
   <div className={styles.actions}><strong>{locationName(accountFor(o), locale)}</strong><StatusBadge status={o.status} label={t(`treasury.${o.status}`)}/><span>{date(openingStart(o.as_of))} · {money(o.balance_amount, o.currency)}</span></div>
   <p>{o.note}</p>{o.status === "draft" && accountFor(o) ? <button className={ui.secondary} disabled={busy} onClick={() => onOpening(accountFor(o)!, o)}>{t("common.actions.edit")}</button> : null}
  </article>)}</Disclosure>
  <Disclosure title={t("statement.receiptMaintenance")}><p>{t("statement.receiptMaintenanceHelp")}</p>
   {!overview.eligible.length && !overview.unresolved.length ? <p>{t("treasury.pendingEmpty")}</p> : null}
   <div className={styles.historical}>{overview.eligible.map(s => <div key={`${s.source_type}:${s.source_id}`}><Link href={sourceHref(s)}>{s.reference}</Link><span>{date(s.received_on)} · {locationName(accountFor(s), locale)}</span><strong>{money(s.cash_amount, s.currency)}</strong><button className={ui.secondary} disabled={busy} onClick={() => onMaterialize(s)}>{t("treasury.materialize")}</button></div>)}</div>
   <div className={styles.historical}>{overview.unresolved.map(({ source: s, block }) => <div key={`${s.source_type}:${s.source_id}`}><Link href={sourceHref(s)}>{s.reference}</Link><span>{t(`treasury.${block}`)}</span><strong>{money(s.cash_amount, s.currency)}</strong>{s.source_type === "direct_money_receipt" && !locationKey(s) ? <button className={ui.secondary} disabled={busy} onClick={() => onMaterialize(s)}>{t("treasury.reviewLocation")}</button> : null}</div>)}</div>
   {overview.historical.length ? <Disclosure title={`${t("treasury.preCutoff")} · ${overview.historical.length}`}><p>{t("treasury.preCutoffHelp")}</p><div className={styles.historical}>{overview.historical.map(s => <div key={`${s.source_type}:${s.source_id}`}><Link href={sourceHref(s)}>{s.reference}</Link><span>{date(s.received_on)} · {locationName(accountFor(s), locale)}</span><strong>{money(s.cash_amount, s.currency)}</strong></div>)}</div></Disclosure> : null}
  </Disclosure>
 </>;
}
