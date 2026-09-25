"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import DetailModal from "../../components/DetailModal";
import { Callout, PageShell } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { CompanyShareDetails, type CompanyStatementRow } from "./company/workspace";
import { accountName, monthRange, type StatementAccount } from "./shared";
import css from "./statement.module.css";
export type StatementRow = Partial<CompanyStatementRow> & { id: string; kind: string; economic_date?: string; occurred_at?: string; confirmed_at?: string; confirmed_by?: string; description?: string; category?: string; vendor?: string; party?: string; income?: number; expense?: number; gross?: number; recoverable_vat?: number; wht?: number; cash?: number; direction?: string; cash_amount?: number; balance?: number | null; href?: string; counterpart?: string | null; transfer_note?: string; reversal_of_transaction_id?: string | null };
export type StatementData = { rows: StatementRow[]; count: number; income?: number; expense?: number; opening?: number | null; inflow?: number; outflow?: number; closing?: number | null; balance_covered?: boolean; opening_start?: string; unclassified_count?: number };
export function UnifiedStatement({ account }: { account?: StatementAccount }) {
 const { t, locale, date } = useI18n(), w = (k: string) => t(`statement.${k}`), seq = useRef(0);
 const [range, setRange] = useState(monthRange), [type, setType] = useState("all"), [search, setSearch] = useState(""), [offset, setOffset] = useState(0), [refresh, setRefresh] = useState(0);
 const [data, setData] = useState<StatementData | null>(null), [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [selected, setSelected] = useState<StatementRow | null>(null);
 const isCompany = !account, validRange = !!range.from && !!range.to && range.from <= range.to;
 const money = (n?: number | null) => n == null ? "—" : `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
 const title = (row: StatementRow) => row.kind === "income" ? t("companyStatement.rowTitle") : row.kind === "transfer" ? `${w(row.direction === "outflow" ? "transferOut" : "transferIn")} ${row.counterpart || w("account")}` : row.reversal_of_transaction_id ? w("reversal") : w(row.kind);
 useEffect(() => { if (!validRange) return; let live = true; const id = ++seq.current;
  const timer = setTimeout(() => { setLoading(true); setFailed(false); const args = { p_from: range.from, p_to: range.to, p_type: type, p_search: search, p_offset: offset };
   void supabase.rpc(isCompany ? "get_finance_unified_company_statement" : "get_finance_account_statement", account ? { ...args, p_bank: account.bank_account_id, p_cash: account.cash_location_id } : args).then(r => {
    if (!live || id !== seq.current) return; if (r.error || !Array.isArray(r.data?.rows)) { setFailed(true); setData(null); } else setData(r.data); setLoading(false);
   }, () => { if (live && id === seq.current) { setFailed(true); setData(null); setLoading(false); } });
  }, 140); return () => { live = false; clearTimeout(timer); };
 }, [range, type, search, offset, refresh, account, isCompany, validRange]);
 function change(fn: () => void) { seq.current++; setData(null); setLoading(true); setSelected(null); setOffset(0); fn(); }
 const totals = isCompany ? [["income", data?.income], ["expense", data?.expense], ["net", data ? (data.income || 0) - (data.expense || 0) : null]] as const : [["opening", data?.opening], ["inflow", data?.inflow], ["outflow", data?.outflow], ["closing", data?.closing]] as const;
 const types = isCompany ? ["all", "income", "company_purchase", "employee_claim"] : ["all", "payment", "direct_money_receipt", "company_purchase", "employee_claim", "participant_payout", "tax_remittance", "transfer", "other"];
 return <PageShell className={css.page}>
  <header className={css.header}><div><h1>{account ? `Statement — ${accountName(account, locale)}` : t("companyStatement.title")}</h1><p>{w(isCompany ? "companyDescription" : "cashDescription")}</p>{account ? <p>{[account.bank_name, account.account_number, !account.is_active ? w("inactive") : ""].filter(Boolean).join(" · ")}</p> : null}</div><div className={css.actions}><Link className={ui.secondary} href="/finance/statement">{w("accounts")}</Link><button className={ui.secondary} aria-label={t("revenueDistribution.retry")} onClick={() => change(() => setRefresh(n => n + 1))}><RefreshCw size={17}/></button></div></header>
  <section className={css.summary} data-company={isCompany}>{totals.map(([key, n]) => <div key={key}><span>{w(key)}</span><strong>{loading || failed ? "—" : money(n)}</strong></div>)}</section>
  <div className={css.filters}><label>{w("from")}<input type="date" lang={locale} value={range.from} max={range.to} onChange={e => change(() => setRange({ ...range, from: e.target.value }))}/></label><label>{w("to")}<input type="date" lang={locale} value={range.to} min={range.from} onChange={e => change(() => setRange({ ...range, to: e.target.value }))}/></label><label>{w("type")}<select value={type} onChange={e => change(() => setType(e.target.value))}>{types.map(k => <option key={k} value={k}>{w(k)}</option>)}</select></label><label>{t("companyStatement.search")}<input type="search" maxLength={200} value={search} onChange={e => change(() => setSearch(e.target.value))}/></label></div>
  {!isCompany ? <p className={css.note}>{w("filteredBalances")}</p> : null}
  {!validRange ? <Callout tone="warning">{w("from")} / {w("to")}</Callout> : failed ? <Callout tone="negative" role="alert">{w("failure")}</Callout> : loading ? <p role="status">{t("common.state.loading")}</p> : data ? <>
   {data.unclassified_count ? <Callout tone="warning">{w("unclassified")} ({data.unclassified_count})</Callout> : null}
   {!isCompany && !data.balance_covered ? <Callout tone="warning">{w("openingUnknown")}{data.opening_start ? ` · ${w("openingStart")} ${date(data.opening_start)}` : ""}</Callout> : null}
   <div className={css.tableWrap}><table className={css.table}><thead><tr>{[t("companyStatement.date"), t("companyStatement.item"), w(isCompany ? "income" : "inflow"), w(isCompany ? "expense" : "outflow"), ...(!isCompany ? [w("balance")] : []), t("companyStatement.detail")].map(k => <th key={k}>{k}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={`${row.kind}:${row.id}`}>
    <td data-label={t("companyStatement.date")}>{date(row.economic_date || row.occurred_at || "")}</td><td><strong>{title(row)}</strong><span>{row.reference || t("companyStatement.sourceReference")}</span><small>{[row.description, row.client, row.matter].filter(Boolean).join(" · ")}</small></td>
    <td className={css.in} data-label={w(isCompany ? "income" : "inflow")}>{isCompany ? row.income ? money(row.income) : "—" : row.direction === "inflow" ? money(row.cash_amount) : "—"}</td>
    <td className={css.out} data-label={w(isCompany ? "expense" : "outflow")}>{isCompany ? row.expense ? money(row.expense) : "—" : row.direction === "outflow" ? money(row.cash_amount) : "—"}</td>
    {!isCompany ? <td className={css.number} data-label={w("balance")}>{money(row.balance)}</td> : null}<td><button className={ui.secondary} onClick={() => setSelected(row)}>{t("companyStatement.detail")}<ArrowRight size={14}/></button></td>
   </tr>)}</tbody></table>{!data.rows.length ? <p className={css.empty}>{w("empty")}</p> : null}</div>
   <footer className={css.pagination}><span>{data.count} {t("revenueDistribution.rows")}</span><div><button className={ui.secondary} disabled={!offset} onClick={() => { setLoading(true); setOffset(n => n - 50); }}>{t("revenueDistribution.previous")}</button><span>{Math.floor(offset / 50) + 1}</span><button className={ui.secondary} disabled={offset + 50 >= data.count} onClick={() => { setLoading(true); setOffset(n => n + 50); }}>{t("revenueDistribution.next")}</button></div></footer>
  </> : null}
  {selected ? <DetailModal open title={t("companyStatement.detail")} onClose={() => setSelected(null)} footer={selected.href ? <Link className={ui.primary} href={selected.href}>{w("source")}<ArrowRight size={16}/></Link> : undefined}>
   {selected.kind === "income" ? <CompanyShareDetails row={selected as CompanyStatementRow}/> : <><div className={css.detailAmount}><div>{title(selected)}<small>{selected.reference}</small></div><strong>{money(isCompany ? selected.expense : selected.cash_amount)}</strong></div><dl className={css.facts}>{[
    [t("companyStatement.date"), date(selected.economic_date || selected.occurred_at || "")],
    [w("account"), account ? accountName(account, locale) : null], [t("revenueDistribution.client"), selected.client], [t("revenueDistribution.matter"), selected.matter],
    ...(isCompany ? [[w("gross"), money(selected.gross)], [w("recoverableVat"), money(selected.recoverable_vat)], [w("wht"), money(selected.wht)], [w("cash"), money(selected.cash)]] : [[w("balance"), money(selected.balance)]]),
    [w("confirmed"), selected.confirmed_at ? new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(selected.confirmed_at)) : null], [w("actor"), selected.confirmed_by], [w("note"), selected.transfer_note],
   ].filter(([,value]) => value != null).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></>}
  </DetailModal> : null}
 </PageShell>;
}
