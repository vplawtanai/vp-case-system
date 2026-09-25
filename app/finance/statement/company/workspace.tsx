"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Building2, RefreshCw } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import { useI18n } from "../../../../lib/i18n/provider";
import DetailModal from "../../../components/DetailModal";
import { Callout, PageShell } from "../../../components/ui/patterns";
import ui from "../../../components/ui/vp-ui.module.css";
import { revenueHref } from "../../revenue-distribution/shared";
import css from "./statement.module.css";

export type CompanyStatementRow = { distribution_id: string; revision: number; finalized_at: string; policy: string; source_type: "payment" | "direct_money_receipt"; source_id: string; received_on: string; currency: string; reference: string | null; document_references: string | null; client: string | null; matter: string | null; amount: number; basis: number };
export type CompanyStatementData = { rows: CompanyStatementRow[]; count: number; excluded_count: number; totals: { currency: string; amount: number }[] };

export function CompanyShareDetails({ row }: { row: CompanyStatementRow }) {
 const { t, locale, date } = useI18n(), w = (k: string) => t(`companyStatement.${k}`);
 const money = (n: number) => `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${row.currency}`;
 const facts = [
  [w("received"), date(row.received_on)], [w("finalized"), new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(row.finalized_at))],
  [w("reference"), row.reference || w("sourceReference")], [w("revision"), String(row.revision)],
  [t("revenueDistribution.client"), row.client || "—"], [t("revenueDistribution.matter"), row.matter || "—"],
  [t("revenueDistribution.source"), t(`revenueDistribution.${row.source_type}`)],
  [w("policy"), row.policy === "vp_distribution_v1" ? "v1" : "v2"], [w("basis"), money(row.basis)],
 ];
 return <><div className={css.share}><Building2 size={24} /><div><strong>{w("rowTitle")}</strong><small>{row.reference || w("sourceReference")}</small></div><b>{money(row.amount)}</b></div>
  <dl className={css.facts}>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  {row.document_references ? <p className={css.note}>{w("documents")}: {row.document_references}</p> : null}
  <p className={css.note}>{w("frozenNote")}</p>
 </>;
}

export function CompanyStatement() {
 const { t, locale, date } = useI18n(), seq = useRef(0), w = (k: string) => t(`companyStatement.${k}`);
 const [data, setData] = useState<CompanyStatementData | null>(null), [loading, setLoading] = useState(true), [failed, setFailed] = useState(false);
 const [month, setMonth] = useState(""), [source, setSource] = useState("all"), [search, setSearch] = useState(""), [offset, setOffset] = useState(0), [refresh, setRefresh] = useState(0), [selected, setSelected] = useState<CompanyStatementRow | null>(null);
 const money = (n: number, currency: string) => `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
 useEffect(() => {
  let live = true; const id = ++seq.current;
  const timer = setTimeout(() => { setLoading(true); setFailed(false); void supabase.rpc("get_finance_company_statement", { p_month: month ? `${month}-01` : null, p_source_type: source, p_search: search, p_offset: offset }).then(r => {
   if (!live || id !== seq.current) return;
   if (r.error || !Array.isArray(r.data?.rows) || !Array.isArray(r.data?.totals)) { setFailed(true); setData(null); } else setData(r.data);
   setLoading(false);
  }, () => { if (live && id === seq.current) { setData(null); setFailed(true); setLoading(false); } }); }, 150);
  return () => { live = false; clearTimeout(timer); };
 }, [month, source, search, offset, refresh]);
 function filter(change: () => void) { seq.current++; setData(null); setLoading(true); setSelected(null); setOffset(0); change(); }
 return <PageShell className={css.page}>
  <header className={css.header}><div><h1>{w("title")}</h1><p>{w("description")}</p></div><button className={ui.secondary} aria-label={t("revenueDistribution.retry")} onClick={() => filter(() => setRefresh(n => n + 1))}><RefreshCw size={17} /></button></header>
  <section className={css.summary} aria-label={w("total")}><Building2 size={26} /><div><span>{w("total")}</span><strong>{loading || failed ? "—" : data?.totals.length ? data.totals.map(r => money(r.amount, r.currency)).join(" / ") : w("noIncome")}</strong></div><p>{w("scope")}</p></section>
  <div className={css.filters}><label>{w("month")}<input type="month" lang={locale} value={month} onChange={e => filter(() => setMonth(e.target.value))} /></label><label>{t("revenueDistribution.source")}<select aria-label={t("revenueDistribution.source")} value={source} onChange={e => filter(() => setSource(e.target.value))}>{["all", "payment", "direct_money_receipt"].map(s => <option key={s} value={s}>{t(`revenueDistribution.${s}`)}</option>)}</select></label><label>{w("search")}<input type="search" maxLength={200} value={search} onChange={e => filter(() => setSearch(e.target.value))} /></label></div>
  {failed ? <Callout tone="negative" role="alert">{t("revenueDistribution.conflict")}</Callout> : loading ? <p role="status">{t("common.state.loading")}</p> : data ? <>
   {data.excluded_count > 0 ? <Callout tone="warning">{w("excluded")} ({data.excluded_count})</Callout> : null}
   <div className={css.tableWrap}><table className={css.table}><thead><tr>{["date", "item", "income", "expense", "detail"].map(k => <th key={k}>{w(k)}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={row.distribution_id}>
    <td data-label={w("date")}>{date(row.received_on)}</td><td data-label={w("item")}><strong>{w("rowTitle")}</strong><span>{row.reference || w("sourceReference")}</span><small>{[row.client, row.matter].filter(Boolean).join(" · ")}</small></td>
    <td className={css.income} data-label={w("income")}>{money(row.amount, row.currency)}</td><td className={css.number} data-label={w("expense")}>—</td><td><button className={ui.secondary} onClick={() => setSelected(row)}>{w("detail")}<ArrowRight size={14} /></button></td>
   </tr>)}</tbody></table>{!data.rows.length ? <p className={css.empty}>{w("empty")}</p> : null}</div>
   <footer className={css.pagination}><span>{data.count} {t("revenueDistribution.rows")}</span><div><button className={ui.secondary} disabled={!offset} onClick={() => { seq.current++; setLoading(true); setOffset(n => n - 50); }}>{t("revenueDistribution.previous")}</button><span>{Math.floor(offset / 50) + 1}</span><button className={ui.secondary} disabled={offset + 50 >= data.count} onClick={() => { seq.current++; setLoading(true); setOffset(n => n + 50); }}>{t("revenueDistribution.next")}</button></div></footer>
  </> : null}
  {selected ? <DetailModal open title={w("detailTitle")} onClose={() => setSelected(null)} footer={<Link className={ui.primary} href={revenueHref(selected.source_type, selected.source_id)}>{w("distribution")}<ArrowRight size={16} /></Link>}><CompanyShareDetails row={selected} /></DetailModal> : null}
 </PageShell>;
}
