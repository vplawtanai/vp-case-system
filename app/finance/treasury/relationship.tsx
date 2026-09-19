"use client";
import { useI18n } from "../../../lib/i18n/provider";
import { ReadOnlyGrid } from "../../components/ui/patterns";
import { treasuryOverview } from "./dashboard";
import type { TreasuryData } from "./shared";
import styles from "./treasury.module.css";
export type TreasuryFlow = { period_month: string; currency: string; receipt_count: number; cash: number; pre_cutoff: number; represented: number; pending: number; unresolved: number };
export function TreasuryRelationship({ data, flow, month, onMonth }: { data: TreasuryData; flow: TreasuryFlow | null; month: string; onMonth: (month: string) => void }) {
 const { t, locale } = useI18n(), overview = treasuryOverview(data);
 const money = (n: number, currency = "THB") => `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
 return <section className={styles.relationship} aria-label={t("treasury.relationship")}>
  <div className={styles.flow}><header><h2>{t("treasury.monthlyCash")}</h2><input type="month" aria-label={t("taxFiling.period")} value={month} onChange={e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) onMonth(e.target.value); }} /></header>
   <strong className={styles.flowTotal}>{flow ? money(flow.cash, flow.currency) : t("treasury.flowUnavailable")}</strong>{flow ? <p>{t("treasury.receiptCount", { count: flow.receipt_count })}</p> : null}<p>{t("treasury.flowHelp")}</p>
   {flow ? <ReadOnlyGrid items={[{ key: "before", label: t("treasury.beforeStart"), value: money(flow.pre_cutoff) }, { key: "posted", label: t("treasury.represented"), value: money(flow.represented) }, ...(flow.pending ? [{ key: "pending", label: t("treasury.pendingTotal"), value: money(flow.pending) }] : []), ...(flow.unresolved ? [{ key: "unknown", label: t("treasury.receiptReview"), value: money(flow.unresolved) }] : [])]} /> : null}
  </div>
  <div className={styles.stock}><h2>{t("treasury.currentStock")}</h2>{overview.balances.map(b => <strong className={styles.flowTotal} key={b.currency}>{money(b.amount, b.currency)}</strong>)}<p>{t("treasury.stockHelp")}</p>
   {overview.components.map(c => <dl key={c.currency}><div><dt>{t("treasury.confirmedOpenings")}</dt><dd>{money(c.amount, c.currency)}</dd></div><div><dt>+ {t("treasury.afterInflow")}</dt><dd>{money(c.inflow, c.currency)}</dd></div><div><dt>− {t("treasury.afterOutflow")}</dt><dd>{money(c.outflow, c.currency)}</dd></div><div className={styles.equationTotal}><dt>= {t("treasury.currentStock")}</dt><dd>{money(overview.balances.find(b => b.currency === c.currency)!.amount, c.currency)}</dd></div></dl>)}
   {!overview.components.length ? <p>{t("treasury.noKnown")}</p> : null}{overview.unknown.length ? <p>{t("treasury.excludesUnknown", { count: overview.unknown.length })}</p> : null}
  </div>
 </section>;
}
