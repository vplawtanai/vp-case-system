"use client";
import { useI18n } from "../../../lib/i18n/provider";
import { treasuryOverview } from "./dashboard";
import type { TreasuryData } from "./shared";
import styles from "./treasury.module.css";
export function TreasuryRelationship({ data }: { data: TreasuryData }) {
 const { t, locale } = useI18n(), overview = treasuryOverview(data);
 const money = (n: number, currency = "THB") => `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
 return <section className={styles.relationship} aria-label={t("treasury.currentStock")}>
  <div><h2>{t("treasury.currentStock")}</h2>{overview.balances.map(b => <strong className={styles.currentTotal} key={b.currency}>{money(b.amount, b.currency)}</strong>)}<p>{t("treasury.stockHelp")}</p>
   {!overview.balances.length ? <strong className={styles.currentTotal}>{t("treasury.noKnown")}</strong> : null}
   {overview.unknown.length ? <p>{t("treasury.excludesUnknown", { count: overview.unknown.length })}</p> : null}
  </div><div className={styles.stock}>
   {overview.components.map(c => <dl key={c.currency}><div><dt>{t("treasury.confirmedOpenings")}</dt><dd>{money(c.amount, c.currency)}</dd></div><div><dt>+ {t("treasury.afterInflow")}</dt><dd>{money(c.inflow, c.currency)}</dd></div><div><dt>− {t("treasury.afterOutflow")}</dt><dd>{money(c.outflow, c.currency)}</dd></div><div className={styles.equationTotal}><dt>= {t("treasury.currentStock")}</dt><dd>{money(overview.balances.find(b => b.currency === c.currency)!.amount, c.currency)}</dd></div></dl>)}
  </div>
 </section>;
}
