"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, ArrowRight, Building2, CircleAlert, Coins, Info, Landmark, List, RefreshCw, Wallet, Clock3 } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { Callout, PageShell } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { accountHref, accountName, bangkokToday, monthRange } from "./shared";
import { loadStatementOverview, overviewTotals, recentOverviewRows, accountKey, type OverviewData } from "./overview-data";
import { AccountIdentity, maskedAccount } from "./account-identity";
import css from "./overview.module.css";

export function StatementOverview({ canCompany, canCash }: { canCompany: boolean; canCash: boolean }) {
 const { t, locale, date } = useI18n(), w = (key: string) => t(`statement.overview.${key}`);
 const [range, setRange] = useState(monthRange), [refresh, setRefresh] = useState(0);
 const [result, setResult] = useState<{ key: string; data?: OverviewData; error?: boolean } | null>(null);
 const today = bangkokToday(), valid = !!range.from && !!range.to && range.from <= range.to && range.to <= today;
 const key = `${range.from}:${range.to}:${refresh}:${canCash}:${canCompany}:${today}`;
 const data = result?.key === key && valid ? result.data : undefined, failed = result?.key === key && result.error, loading = valid && !data && !failed;
 useEffect(() => {
  if (!valid) return; let live = true;
  const timer = setTimeout(() => { void loadStatementOverview((name, args) => supabase.rpc(name, args), { canCash, canCompany, from: range.from, to: range.to, today }, () => live)
   .then(data => { if (live) setResult({ key, data }); }, () => { if (live) setResult({ key, error: true }); }); }, 140);
  return () => { live = false; clearTimeout(timer); };
 }, [valid, key, range.from, range.to, canCash, canCompany, today]);
 const totals = data ? overviewTotals(data.accounts) : null, rows = data ? recentOverviewRows(data.accounts) : [];
 const money = (n?: number | null) => n == null ? "—" : n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
 const period = `${date(range.from)} – ${date(range.to)}`;
 const metric = (label: string, value: number | null | undefined, Icon: typeof Coins, tone: string, note: string) => <article className={css.metric} data-tone={tone}><span className={css.icon}><Icon size={23}/></span><div><h3>{label}</h3><strong>{money(value)}</strong><small>THB · {note}</small></div></article>;
 return <PageShell className={css.page}>
  <header className={css.header}><div className={css.title}><span className={css.titleIcon}><Coins size={30}/></span><div><h1>{w("title")}</h1><p>{w("subtitle")}</p></div></div><div className={css.actions}>
   {canCash ? <a href="#statement-accounts" className={ui.secondary}><List size={16}/>{t("statement.accounts")}</a> : null}
   <button className={ui.secondary} disabled={loading} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={16}/>{w("refresh")}</button>
   {data?.canTransfer ? <Link className={ui.primary} href="/finance/statement/transfers"><ArrowLeftRight size={16}/>{t("statement.transfer")}</Link> : null}
  </div></header>
  {failed ? <Callout tone="negative" role="alert">{w("failed")}</Callout> : null}
  {loading ? <p role="status" className={css.loading}>{t("common.state.loading")}</p> : null}
  {canCash ? <section aria-labelledby="liquidity-heading" className={css.liquidity}>
   <div><div className={css.sectionHeading}><h2 id="liquidity-heading">{w("liquidity")}</h2><span>{w("asOf")} {date(today)}</span></div>
    <div className={css.metrics} data-testid="liquidity-metrics">
     {metric(w("total"), totals?.total, Coins, "positive", w("confirmedCash"))}
     {metric(w("bank"), totals?.bank, Landmark, "blue", w("allBanks"))}
     {metric(w("cash"), totals?.cash, Wallet, "positive", w("allCash"))}
    </div>
    {totals?.unknown ? <p className={css.warning}><CircleAlert size={16}/>{w("unknown")} ({totals.unknown})</p> : null}
    <p className={css.caption}>{w("liquidityHelp")}</p>
   </div>
   <aside className={css.guide}><h2><Info size={18}/>{w("guide")}</h2><ul><li>{w("ruleTransfer")}</li><li>{w("ruleWht")}</li><li>{w("ruleOpening")}</li><li>{w("ruleCompany")}</li></ul>{canCompany ? <Link href="/finance/statement/company"><Building2 size={18}/>{t("companyStatement.title")}<ArrowRight size={16}/></Link> : null}</aside>
  </section> : null}
  <div className={css.periodBar}><div><h2>{w("periodHeading")}</h2><p>{w("periodHelp")}</p></div><div className={css.dates}>
   <label>{t("statement.from")}<input type="date" lang={locale} value={range.from} max={range.to || today} onChange={e => setRange({ ...range, from: e.target.value })}/></label>
   <label>{t("statement.to")}<input type="date" lang={locale} value={range.to} min={range.from} max={today} onChange={e => setRange({ ...range, to: e.target.value })}/></label>
  </div></div>
  {!valid ? <Callout tone="warning">{w("invalidRange")}</Callout> : null}
  {canCash ? <section aria-label={w("movementHeading")} className={css.metrics} data-testid="movement-metrics">
   {metric(w("externalIn"), totals?.externalIn, ArrowDownLeft, "positive", w("excludesTransfers"))}
   {metric(w("externalOut"), totals?.externalOut, ArrowUpRight, "negative", w("excludesTransfers"))}
   {metric(w("internal"), totals?.internal, ArrowLeftRight, "blue", w("countOnce"))}
  </section> : null}
  {canCompany ? <section className={css.company} aria-labelledby="economic-heading" data-testid="company-economics"><div className={css.companyHeading}><div><h2 id="economic-heading"><Building2 size={20}/>{w("economic")}</h2><p>{w("economicHelp")}</p></div><Link href="/finance/statement/company">{w("viewCompany")}<ArrowRight size={16}/></Link></div>
   <div className={css.companyTotals}>{[["income", data?.company?.income], ["expense", data?.company?.expense], ["net", data?.company ? (data.company.income || 0) - (data.company.expense || 0) : null]].map(([k, value]) => <div key={String(k)}><span>{t(`statement.${k}`)}</span><strong>{money(value as number | null)} <small>THB</small></strong></div>)}</div>
   {data?.company?.unclassified_count ? <p className={css.warning}><CircleAlert size={16}/>{t("statement.unclassified")} ({data.company.unclassified_count})</p> : null}
  </section> : null}
  {canCash ? <section id="statement-accounts" aria-labelledby="accounts-heading" className={css.accountSection}><div className={css.sectionHeading}><h2 id="accounts-heading"><Landmark size={20}/>{w("accountHeading")}</h2><span>{w("currentAndPeriod")}</span></div>
   <div className={css.accountGrid}>{data?.accounts.map(a => <article key={accountKey(a.account)} className={css.accountCard}><header><AccountIdentity account={a.account}/><div><h3>{accountName(a.account, locale)}</h3><small>{maskedAccount(a.account) || w("cashAccount")}</small></div>{!a.account.is_active ? <span className={css.inactive}>{t("statement.inactive")}</span> : null}</header>
    <span className={css.caption}>{w("latestBalance")}</span><strong className={css.accountBalance}>{money(a.current.balance_covered ? a.current.closing : null)} <small>THB</small></strong>
    {a.current.closing == null || !a.current.balance_covered ? <p className={css.warning}>{w("accountUnknown")}</p> : null}
    <dl><div><dt>{t("statement.inflow")}</dt><dd className={css.in}>{money(a.period.inflow)}</dd></div><div><dt>{t("statement.outflow")}</dt><dd className={css.out}>{money(a.period.outflow)}</dd></div></dl>
    <p className={css.caption}>{w("includesTransfers")}</p><Link href={accountHref(a.account)}>{w("viewStatement")}<ArrowRight size={16}/></Link>
   </article>)}</div>{data && !data.accounts.length ? <p className={css.empty}>{w("noAccounts")}</p> : null}
  </section> : null}
  {canCash ? <section className={css.movements} aria-labelledby="movements-heading"><div className={css.sectionHeading}><h2 id="movements-heading"><Clock3 size={20}/>{w("recent")}</h2><span>{period}</span></div><p className={css.caption}>{w("recentHelp")}</p>
   <table><thead><tr>{[t("companyStatement.date"), t("statement.account"), t("statement.type"), t("companyStatement.item"), t("statement.inflow"), t("statement.outflow"), w("accountAfter")].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={`${accountKey(row.account)}:${row.id}`}>
    <td data-label={t("companyStatement.date")}>{date(row.occurred_at || "")}</td><td data-label={t("statement.account")}><Link href={accountHref(row.account)}>{accountName(row.account, locale)}</Link></td><td><span className={css.badge} data-kind={row.kind}>{t(`statement.${row.kind}`)}</span></td>
    <td><strong>{row.description || row.reference || t(`statement.${row.kind}`)}</strong><small>{row.reference}</small></td>
    <td data-label={t("statement.inflow")} className={css.in}>{row.direction === "inflow" ? money(row.cash_amount) : "—"}</td><td data-label={t("statement.outflow")} className={css.out}>{row.direction === "outflow" ? money(row.cash_amount) : "—"}</td><td data-label={w("accountAfter")}>{money(row.balance)}</td>
   </tr>)}</tbody></table>{data && !rows.length ? <p className={css.empty}>{t("statement.empty")}</p> : null}
  </section> : null}
  {data?.canManageOpenings ? <details className={css.tools}><summary>{t("statement.tools")}</summary><Link href="/finance/treasury">{t("statement.tools")}<ArrowRight size={16}/></Link></details> : null}
 </PageShell>;
}
