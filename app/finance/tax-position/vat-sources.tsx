"use client";
import Link from "next/link";
import { useI18n } from "../../../lib/i18n/provider";
import { Callout } from "../../components/ui/patterns";
import type { TaxMonth } from "./period-data";
import { vatSourceTrace } from "./vat-source-data";
import css from "./vat-sources.module.css";

export function VatSources({ data }: { data: TaxMonth }) {
 const { t, locale, date } = useI18n(), tr = (key: string) => t(`taxHome.${key}`), trace = vatSourceTrace(data);
 const money = (value: number | null) => value === null ? tr("unknown") : `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
 const month = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${data.month}-01T00:00:00+07:00`));
 return <div className={css.trace}>
  <p className={css.period}>{tr("taxPeriod")}: {month}</p>
  {!trace.reconciled ? <div role="alert"><Callout tone="negative">{tr(trace.unavailable ? "vatTraceUnavailable" : "vatTraceMismatch")}</Callout></div> : null}
  {(["output", "input"] as const).map(kind => <section key={kind} className={css.group} aria-label={tr(kind)}>
   <header className={css.heading}><h3>{tr(kind)}</h3><strong>{money(kind === "output" ? trace.outputTotal : trace.inputTotal)}</strong></header>
   {!trace[kind].length ? <p className={css.empty}>{tr(trace.unavailable ? "vatTraceUnavailable" : kind === "output" ? "noOutputSources" : "noInputSources")}</p> : <ul className={css.rows}>{trace[kind].map(row => <li key={row.key}>
    <div className={css.rowHead}><div><strong>{row.party || row.reference}</strong><p>{row.party ? `${row.reference} · ` : ""}{date(row.date)}</p><span>{tr(`source_${row.kind}`)}{kind === "input" ? ` · ${tr("eligible")}` : ""}</span></div><strong className={css.amount}>VAT {money(row.vat)}</strong></div>
    {kind === "input" ? <p className={css.base}>{tr("base")} {money(row.base)}</p> : null}
    {row.href ? <Link className={css.link} href={row.href}>{t("taxDashboard.openSource")} →</Link> : <details className={css.details}><summary>{tr("details")}</summary><p>{row.note || "—"}</p><p>{tr("funding")}</p></details>}
   </li>)}</ul>}
  </section>)}
  <section className={css.reconciliation} aria-label={tr("vatReconciliation")}>
   <div className={css.heading}><h3>{tr("net")}</h3><strong>{money(trace.summary.net)}</strong></div>
   <p>{tr("output")} {money(trace.outputTotal)} − {tr("input")} {money(trace.inputTotal)} = {money(trace.net)}</p>
   {trace.reconciled ? <p className={css.success}>{tr("vatTraceMatched")}</p> : <dl className={css.comparison}>{(["output", "input", "net"] as const).map(key => <div key={key}><dt>{tr("summaryAmount")} · {tr(key)}</dt><dd>{money(trace.summary[key])}</dd></div>)}</dl>}
  </section>
 </div>;
}
