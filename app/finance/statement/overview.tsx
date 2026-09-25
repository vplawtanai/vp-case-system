"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, ArrowRight, CircleAlert, Coins, Info, Landmark, List, RefreshCw, Wallet, Clock3 } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { Callout, PageShell } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { accountHref, accountName, bangkokToday, monthRange } from "./shared";
import { loadStatementOverview, overviewTotals, accountKey, type OverviewData } from "./overview-data";
import { expandOverviewActivity, type OverviewActivity } from "./overview-activity";
import { AccountIdentity, maskedAccount } from "./account-identity";
import css from "./overview.module.css";

export function StatementOverview({ canCash }: { canCash: boolean }) {
 const { t, locale, date } = useI18n(), w = (key: string) => t(`statement.overview.${key}`);
 const [range, setRange] = useState(monthRange), [refresh, setRefresh] = useState(0);
 const [result, setResult] = useState<{ key: string; data?: OverviewData; error?: boolean } | null>(null);
 const [activityResult, setActivityResult] = useState<{ data: OverviewData; activity: OverviewActivity } | null>(null);
 const [expansion, setExpansion] = useState<{ data: OverviewData; busy?: boolean; failed?: boolean } | null>(null), expansionLock = useRef(false), generation = useRef(0);
 const today = bangkokToday(), valid = !!range.from && !!range.to && range.from <= range.to && range.to <= today;
 const key = `${range.from}:${range.to}:${refresh}:${canCash}:${today}`;
 const data = result?.key === key && valid ? result.data : undefined, failed = result?.key === key && result.error, loading = valid && !data && !failed;
 useEffect(() => {
  const request = ++generation.current; expansionLock.current = false;
  if (!valid) return; let live = true;
  const timer = setTimeout(() => { void loadStatementOverview((name, args) => supabase.rpc(name, args), { canCash, from: range.from, to: range.to, today }, () => live)
   .then(data => { if (live) setResult({ key, data }); }, () => { if (live) setResult({ key, error: true }); }); }, 140);
  return () => { live = false; generation.current = request + 1; clearTimeout(timer); };
 }, [valid, key, range.from, range.to, canCash, today]);
 const activity = data ? activityResult?.data === data ? activityResult.activity : data.activity : undefined;
 const totals = data ? overviewTotals(data.accounts) : null, rows = activity?.rows || [], expanding = data && expansion?.data === data && expansion.busy, activityFailed = data && expansion?.data === data && expansion.failed;
 async function showMore() {
  if (!data || !activity || expansionLock.current || activityFailed) return;
  const request = generation.current;
  expansionLock.current = true; setExpansion({ data, busy: true });
  try {
   const next = await expandOverviewActivity((name, args) => supabase.rpc(name, args), activity, () => generation.current === request);
   if (generation.current === request) { setActivityResult({ data, activity: next }); setExpansion({ data }); }
  } catch { if (generation.current === request) setExpansion({ data, failed: true }); }
  finally { if (generation.current === request) expansionLock.current = false; }
 }
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
   <aside className={css.guide}><h2><Info size={18}/>{w("guide")}</h2><ul><li>{w("ruleTransfer")}</li><li>{w("ruleWht")}</li><li>{w("ruleOpening")}</li></ul></aside>
  </section> : null}
  <div className={css.periodBar}><div><h2>{w("periodHeading")}</h2><p>{w("periodHelp")}</p></div><div className={css.dates}>
   <label>{t("statement.from")}<input type="date" lang={locale} value={range.from} max={range.to || today} onChange={e => { setRefresh(n => n + 1); setRange({ ...range, from: e.target.value }); }}/></label>
   <label>{t("statement.to")}<input type="date" lang={locale} value={range.to} min={range.from} max={today} onChange={e => { setRefresh(n => n + 1); setRange({ ...range, to: e.target.value }); }}/></label>
  </div></div>
  {!valid ? <Callout tone="warning">{w("invalidRange")}</Callout> : null}
  {canCash ? <section aria-label={w("movementHeading")} className={css.metrics} data-testid="movement-metrics">
   {metric(w("externalIn"), totals?.externalIn, ArrowDownLeft, "positive", w("excludesTransfers"))}
   {metric(w("externalOut"), totals?.externalOut, ArrowUpRight, "negative", w("excludesTransfers"))}
   {metric(w("internal"), totals?.internal, ArrowLeftRight, "blue", w("countOnce"))}
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
    <td data-label={t("companyStatement.date")}>{date(row.occurred_at || "")}</td><td data-label={t("statement.account")}><Link href={accountHref(row.account)}>{accountName(row.account, locale)}</Link>{row.toAccount ? <> → <Link href={accountHref(row.toAccount)}>{accountName(row.toAccount, locale)}</Link></> : null}</td><td><span className={css.badge} data-kind={row.kind}>{t(`statement.${row.kind}`)}</span></td>
    <td><strong>{row.toAccount ? `${w("internal")} · ${money(row.cash_amount)} THB` : row.description || row.reference || t(`statement.${row.kind}`)}</strong><small>{row.toAccount ? row.transfer_note || row.description : row.reference}</small></td>
    <td data-label={t("statement.inflow")} className={css.in}>{!row.toAccount && row.direction === "inflow" ? money(row.cash_amount) : "—"}</td><td data-label={t("statement.outflow")} className={css.out}>{!row.toAccount && row.direction === "outflow" ? money(row.cash_amount) : "—"}</td><td data-label={w("accountAfter")}>{row.toAccount ? "—" : money(row.balance)}</td>
   </tr>)}</tbody></table>{data && !rows.length ? <p className={css.empty}>{t("statement.empty")}</p> : null}
   {activity ? <footer className={css.activityFooter}><span role="status">{t("statement.overview.rowCount", { shown: rows.length, count: activity.count })}</span>{rows.length < activity.count ? <button className={ui.secondary} disabled={!!expanding || !!activityFailed} onClick={() => void showMore()}>{expanding ? t("common.state.loading") : w("showMore")}</button> : null}</footer> : null}
   {activityFailed ? <Callout tone="warning" role="alert">{w("activityChanged")} <button className={ui.secondary} onClick={() => setRefresh(n => n + 1)}>{w("refresh")}</button></Callout> : null}
  </section> : null}
  {data?.canManageOpenings ? <div className={css.tools}><Link href="/finance/statement/opening-balances">{t("statement.manageOpenings")}<ArrowRight size={16}/></Link></div> : null}
 </PageShell>;
}
