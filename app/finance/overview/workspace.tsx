"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Building2, CalendarDays, CircleAlert, Coins, FileText, Info, Landmark, Layers, PieChart, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import type { UserPermissions } from "../../../lib/permissions";
import { useI18n } from "../../../lib/i18n/provider";
import DetailModal from "../../components/DetailModal";
import { PageShell } from "../../components/ui/patterns";
import { accountHref, accountName, bangkokToday } from "../statement/shared";
import { AccountIdentity } from "../statement/account-identity";
import { revenueHref } from "../revenue-distribution/shared";
import { currentBangkokMonth, shiftMonth, summarizeDashboard } from "../tax-position/dashboard-data";
import { readTaxMonth, taxMonthSummary } from "../tax-position/period-data";
import { filingObligationDisplay, filingObligationsForDisplay, filingMonthForTaxPeriod, taxPeriodForFilingMonth } from "../tax-position/filing-period-view";
import { activeFiling } from "../tax-position/filings/shared";
import { VatSources } from "../tax-position/vat-sources";
import { economics, liquidity, loadOverview, monthDates, type Aggregate, type Data, type Result } from "./data";
import css from "./overview.module.css";

type Amount = { currency: string; amount: number | null };
type Alert = { key: string; count: number; href: string; amounts?: Amount[] };
const routes = { statement: "/finance/statement", invoices: "/finance/invoices", payables: "/finance/payables", tax: "/finance/tax-position", distribution: "/finance/revenue-distribution" };

 function Values({ values, id }: { values: Amount[] | null; id?: string }) {
  const { t, locale } = useI18n(), w = (key: string) => t(`executive.${key}`);
  return <div className={css.values} data-metric={id}>{values === null ? <strong>—</strong> : values.length === 0 ? <span className={css.muted}>{w("empty")}</span> : values.map(row => <div key={row.currency}><strong>{row.amount === null ? "—" : row.amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small>{row.currency}</small></div>)}</div>;
 }
 function Notice({ result }: { result: Result<unknown> | undefined }) {
  const { t } = useI18n(), w = (key: string) => t(`executive.${key}`);
  return result && result.status !== "ready" ? <p className={css.notice} role={result.status === "error" ? "alert" : undefined}>{w(result.status === "error" ? "failed" : "denied")}</p> : null;
 }
 function Metric({ label, values, scope, icon, tone, id, action }: { label: string; values: Amount[] | null; scope?: string; icon: ReactNode; tone?: string; id: string; action?: ReactNode }) {
  const { t } = useI18n(), w = (key: string) => t(`executive.${key}`);
  return <article className={css.metric} data-tone={tone}><span className={css.icon}>{icon}</span><div className={css.metricBody}><h3>{w(label)}</h3><Values values={values} id={id}/>{scope ? <p>{scope}</p> : null}{action}</div></article>;
 }
 function More({ href, children }: { href: string; children?: ReactNode }) { const { t } = useI18n(), w = (key: string) => t(`executive.${key}`); return <Link className={css.link} href={href}>{children || w("more")}<ArrowRight size={13}/></Link>; }
 function Section({ name, help, icon, tone, action, children }: { name: string; help: string; icon: ReactNode; tone: string; action?: ReactNode; children: ReactNode }) {
  const { t } = useI18n(), w = (key: string) => t(`executive.${key}`);
  return <section className={css.section} data-section={name} data-tone={tone} aria-labelledby={`overview-${name}`}><header className={css.sectionHead}><span className={css.sectionIcon}>{icon}</span><div><h2 id={`overview-${name}`}>{w(name)}</h2><p>{help}</p></div>{action}</header>{children}</section>;
 }
 function Liability({ result, rows, href }: { result: Result<Aggregate> | undefined; rows: [string, string, string][]; href: string }) {
  const { t } = useI18n(), w = (key: string) => t(`executive.${key}`);
  return <><Notice result={result}/>{result?.status === "ready" ? result.value.currencies.length ? result.value.currencies.map(currency => <div className={css.liability} key={currency.currency}><div className={css.currencyLabel}>{currency.currency}</div>{rows.map(([label, amount, count]) => <Link href={href} key={label} className={css.liabilityRow}><span>{w(label)}</span><small>{t("executive.count", { count: Number(currency[count]) })}</small><Values values={[{ currency: currency.currency, amount: Number(currency[amount]) }]}/></Link>)}</div>) : <p className={css.empty}>{w("empty")}</p> : !result ? <p className={css.empty}>—</p> : null}</>;
 }

export function ExecutiveOverview({ permissions }: { permissions: UserPermissions }) {
 const [month, setMonth] = useState(currentBangkokMonth), [refresh, setRefresh] = useState(0);
 const [snapshot, setSnapshot] = useState<{ month: string; refresh: number; data: Data } | null>(null);
 const [detail, setDetail] = useState<"accounts" | "vat" | null>(null);
 const today = bangkokToday(), taxPeriod = taxPeriodForFilingMonth(currentBangkokMonth());
 useEffect(() => {
  let live = true;
  void loadOverview((name, args) => supabase.rpc(name, args), permissions, month, today, () => readTaxMonth(supabase, permissions, taxPeriod))
   .then(data => { if (live) setSnapshot({ month, refresh, data }); });
  return () => { live = false; };
 }, [permissions, month, refresh, today, taxPeriod]);
 const data = snapshot?.month === month && snapshot.refresh === refresh ? snapshot.data : null;
 return <OverviewView data={data} month={month} today={today} setMonth={value => { setDetail(null); setMonth(value); }} refresh={() => { setDetail(null); setRefresh(n => n + 1); }} detail={detail} setDetail={setDetail} />;
}

// Present the read contracts only; no transaction or financial action is available here.
export function OverviewView({ data, month, today, setMonth, refresh, detail, setDetail }: {
 data: Data | null; month: string; today: string; setMonth: (month: string) => void; refresh: () => void;
 detail: "accounts" | "vat" | null; setDetail: (detail: "accounts" | "vat" | null) => void;
}) {
 const { t, locale, date } = useI18n(), w = (key: string) => t(`executive.${key}`);
 const monthLabel = (value: string) => new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${value}-01T00:00:00+07:00`));
 const range = monthDates(month), period = `${date(range.from)} – ${date(range.to)}`;
 const balances = data?.treasury.status === "ready" ? liquidity(data.treasury.value, today) : null;
 const economic = data?.economic.status === "ready" ? economics(data.economic.value) : null;
 const tax = data?.tax.status === "ready" ? data.tax.value : null;
 const taxSummary = tax ? taxMonthSummary(tax.month) : null;
 const taxOutstanding = tax ? summarizeDashboard({ ...tax.month.sources, register: tax.register }, tax.month.month).outgoingDue : null;
 const partial = data && Object.entries(data).some(([key, value]) => key !== "loadedAt" && typeof value === "object" && value.status !== "ready");
 const amounts = (result: Result<Aggregate> | undefined, field: string): Amount[] | null => result?.status === "ready" ? result.value.currencies.map(row => ({ currency: row.currency, amount: row[field] as number })) : null;
 const balanceAmounts = (field: "total" | "bank" | "cash") => balances?.totals.map(row => ({ currency: row.currency, amount: row[field] })) ?? null;
 const economicAmounts = (field: "income" | "expense" | "net") => economic?.map(row => ({ currency: row.currency, amount: row[field] })) ?? null;
 const pending = data?.distribution.status === "ready" ? data.distribution.value.summary.filter(row => row.state === "pending") : null;
 const pendingAmounts = pending?.map(row => ({ currency: row.currency, amount: row.unresolved > 0 ? null : row.amount })) ?? null;
 const alerts: Alert[] = [];
 if (data?.economic.status === "ready" && data.economic.value.alerts.unclassified_count) alerts.push({ key: "unclassified", count: data.economic.value.alerts.unclassified_count, href: "/finance/expenses" });
 if (taxSummary && taxSummary.pendingCount + taxSummary.unclassified.length > 0) alerts.push({ key: "taxEvidence", count: taxSummary.pendingCount + taxSummary.unclassified.length, href: routes.tax });
 if (balances?.unknown) alerts.push({ key: "opening", count: balances.unknown, href: routes.statement });
 for (const [key, result, countField, amountField, href] of [
  ["overdue", data?.receivables, "overdue_count", "overdue_amount", routes.invoices],
  ["totalPayable", data?.payables, "outstanding_count", "outstanding_amount", routes.payables],
  ["participants", data?.participants, "unpaid_entitlement_count", "unpaid_amount", routes.distribution],
 ] as const) if (result?.status === "ready") { const rows = result.value.currencies.filter(row => Number(row[countField]) > 0); if (rows.length) alerts.push({ key, count: rows.reduce((n, row) => n + Number(row[countField]), 0), href, amounts: rows.map(row => ({ currency: row.currency, amount: Number(row[amountField]) })) }); }
 if (pending?.some(row => row.count > 0)) alerts.push({ key: "pendingDistribution", count: pending.reduce((n, row) => n + row.count, 0), href: routes.distribution, amounts: pendingAmounts! });

 const taxScope = tax ? `${w("taxPeriod")} ${monthLabel(tax.month.month)}` : w("taxPeriod");
 const vatAmounts = taxSummary ? [{ currency: "THB", amount: taxSummary.net }] : null;
 const obligationDisplay = tax ? filingObligationsForDisplay(tax.month) : null;
 const sourceRows = data?.economic.status === "ready" ? [
  ...data.economic.value.income.rows.map(row => ({ key: `share:${row.distribution_id}`, date: row.received_on, title: row.client || row.reference || t("companyStatement.rowTitle"), type: w("income"), amount: row.amount, currency: row.currency, href: revenueHref(row.source_type, row.source_id) })),
  ...data.economic.value.expenses.rows.filter(row => row.kind !== "income").map(row => ({ key: `${row.kind}:${row.id}`, date: row.economic_date || "", title: row.description || row.vendor || row.reference || w("expense"), type: w("expense"), amount: row.expense ?? null, currency: "THB", href: row.href })),
 ].sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key)).slice(0, 5) : [];
 return <PageShell className={css.page}>
  <header className={css.header}><div><h1>{w("title")}</h1><p>{w("subtitle")}</p></div><div className={css.toolbar}><label>{w("period")}<select aria-label={w("period")} value={month} onChange={event => setMonth(event.target.value)}>{Array.from({ length: 25 }, (_, i) => shiftMonth(today.slice(0, 7), 3 - i)).map(value => <option key={value} value={value}>{monthLabel(value)}</option>)}</select></label><button className={css.refresh} aria-label={w("refresh")} onClick={refresh}><RefreshCw size={17}/></button></div></header>
  <div className={css.asOf}>{data ? `${w("asOf")} ${date(data.loadedAt, true)}` : <span role="status">{t("common.state.loading")}</span>}</div>
  {partial ? <p className={css.partial} role="status"><Info size={16}/>{w("partial")}</p> : null}
  <div className={css.mobileSummary} aria-label={w("title")}>
   <Metric label="totalCash" values={balanceAmounts("total")} scope={balances?.unknown ? w("unknown") : w("current")} icon={<Wallet/>} tone="green" id="mobile-cash" action={<More href={routes.statement}/>}/>
   <Metric label="net" values={economicAmounts("net")} scope={w("economicHelp")} icon={<Building2/>} tone="blue" id="mobile-net"/>
   <Metric label="vat" values={vatAmounts} scope={taxScope} icon={<FileText/>} tone="purple" id="mobile-vat" action={<More href={routes.tax}/>}/>
   <article className={css.mobileAlert}><CircleAlert size={20}/><div><h2>{w("alerts")}</h2>{!data ? "—" : alerts[0] ? <><More href={alerts[0].href}>{w(alerts[0].key)} · {alerts[0].count}</More>{alerts[0].key === "unclassified" ? <More href="/finance/expenses/claims">{w("reimbursement")}</More> : null}{alerts[0].amounts ? <Values values={alerts[0].amounts}/> : null}</> : <p>{partial ? w("partial") : w("none")}</p>}</div></article>
   <a href="#overview-details" className={css.link}>{w("all")}<ArrowDownLeft size={14}/></a>
  </div>
  <div className={css.canvas} id="overview-details" aria-busy={!data}><div className={css.main}>
   <Section name="cash" help={`${w("cashHelp")} · ${w("visible")}`} icon={<Wallet size={18}/>} tone="green" action={<More href={routes.statement}>Statement</More>}>
    <div className={css.cashGrid}>
     <Metric label="totalCash" values={balanceAmounts("total")} scope={w("current")} icon={<Coins/>} tone="green" id="cash-total" action={<button className={css.link} disabled={!balances} onClick={() => setDetail("accounts")}>{w("accounts")}<ArrowRight size={13}/></button>}/>
     <Metric label="bank" values={balanceAmounts("bank")} scope={w("current")} icon={<Landmark/>} tone="blue" id="cash-bank"/>
     <Metric label="office" values={balanceAmounts("cash")} scope={w("current")} icon={<Wallet/>} tone="green" id="cash-office"/>
     <Metric label="externalIn" values={amounts(data?.cash, "external_inflow")} scope={period} icon={<ArrowDownLeft/>} tone="green" id="cash-in"/>
     <Metric label="externalOut" values={amounts(data?.cash, "external_outflow")} scope={period} icon={<ArrowUpRight/>} tone="red" id="cash-out"/>
    </div><Notice result={data?.treasury}/><Notice result={data?.cash}/>
    {balances?.unknown ? <p className={css.notice}>{w("unknown")}</p> : null}
    <div className={css.secondaryLine}><span>{w("internal")} · {w("periodScope")}</span><Values values={amounts(data?.cash, "internal_transfer_amount")}/></div>
   </Section>
   <Section name="economic" help={w("economicHelp")} icon={<Layers size={18}/>} tone="blue">
    <div className={css.three}>{(["income", "expense", "net"] as const).map((key, i) => <Metric key={key} label={key} values={economicAmounts(key)} scope={period} icon={i === 1 ? <ArrowUpRight/> : i === 2 ? <PieChart/> : <Building2/>} tone={i === 1 ? "red" : "green"} id={`economic-${key}`}/>)}</div>
    <Notice result={data?.economic}/><p className={css.note}>{w("economicNote")}</p>
    {data?.economic.status === "ready" && (data.economic.value.income.excluded_count > 0 || !!data.economic.value.expenses.unclassified_count) ? <p className={css.notice}>{w("excluded")}</p> : null}
   </Section>
   <div className={css.two}>
    <Section name="receivables" help={w("receivableHelp")} icon={<FileText size={18}/>} tone="green" action={<More href={routes.invoices}/>}><Liability result={data?.receivables} href={routes.invoices} rows={[["outstandingInvoice", "outstanding_amount", "outstanding_count"], ["overdue", "overdue_amount", "overdue_count"], ["dueSoon", "due_soon_amount", "due_soon_count"], ["noDue", "no_due_date_amount", "no_due_date_count"]]}/></Section>
    <Section name="payables" help={w("payableHelp")} icon={<Wallet size={18}/>} tone="orange" action={<More href={routes.payables}/>}><Liability result={data?.payables} href={routes.payables} rows={[["totalPayable", "outstanding_amount", "outstanding_count"], ["purchase", "company_purchase_amount", "company_purchase_count"], ["reimbursement", "reimbursement_amount", "reimbursement_count"], ["dueSoon", "due_soon_amount", "due_soon_count"]]}/></Section>
   </div>
   <Section name="tax" help={w("taxHelp")} icon={<FileText size={18}/>} tone="purple" action={<More href={routes.tax}/>}>
    <p className={css.note}>{taxScope}{tax ? ` · ${w("filingMonth")} ${monthLabel(filingMonthForTaxPeriod(tax.month.month))}` : ""}</p>
    <div className={css.four}>
     <Metric label="vat" values={vatAmounts} icon={<FileText/>} tone="purple" id="tax-vat" action={<button className={css.link} disabled={!tax} onClick={() => setDetail("vat")}>{w("source")}<ArrowRight size={13}/></button>}/>
     <Metric label="wht" values={tax ? [{ currency: "THB", amount: taxOutstanding }] : null} icon={<ArrowDownLeft/>} tone="green" id="tax-wht" action={<More href={`${routes.tax}/filings`}/>}/>
     <Metric label="credit" values={taxSummary ? [{ currency: "THB", amount: taxSummary.incoming }] : null} icon={<ShieldCheck/>} tone="purple" id="tax-credit" action={<More href={routes.tax}/>}/>
     <article className={css.filing}><h3>{w("taxStatus")}</h3>{tax && obligationDisplay ? <>{obligationDisplay.pools.map(pool => { const status = filingObligationDisplay(pool, activeFiling(tax.month.filing, pool.filing_type), tax.month.deadlines[pool.filing_type]); return <Link href={`${routes.tax}/filings`} key={pool.filing_type}><span>{t(`taxHome.${pool.filing_type === "vat" ? "vatForm" : pool.filing_type}`)}</span><strong data-status={status.state}>{t(`taxHome.${status.state}`)}</strong></Link>; })}{obligationDisplay.whtNeedsReview ? <Link href={routes.tax}>WHT · {t("taxHome.classify")}</Link> : null}</> : <span>—</span>}<small>{w("taxSeparate")}</small></article>
    </div><Notice result={data?.tax}/>
   </Section>
   <Section name="distribution" help={w("distributionHelp")} icon={<PieChart size={18}/>} tone="purple" action={<More href={routes.distribution}/>}>
    <div className={css.three}><Metric label="pendingDistribution" values={pendingAmounts} scope={w("distributionBasis")} icon={<PieChart/>} tone="blue" id="distribution-pending"/>
     <Metric label="participants" values={amounts(data?.participants, "unpaid_amount")} scope={data?.participants.status === "ready" ? t("executive.count", { count: data.participants.value.currencies.reduce((n, row) => n + Number(row.unpaid_entitlement_count), 0) }) : w("current")} icon={<Coins/>} tone="green" id="distribution-unpaid"/>
     <article className={css.metric}><span className={css.icon}><CalendarDays/></span><div className={css.metricBody}><h3>{w("oldest")}</h3>{data?.participants.status === "ready" ? data.participants.value.currencies.length ? data.participants.value.currencies.map(row => <p key={row.currency}>{row.oldest_unpaid_at ? date(String(row.oldest_unpaid_at)) : "—"} · {row.currency}</p>) : w("empty") : "—"}<More href={routes.distribution}/></div></article></div><Notice result={data?.distribution}/><Notice result={data?.participants}/>
   </Section>
   <Section name="alerts" help={w("alertHelp")} icon={<CircleAlert size={18}/>} tone="red">
    <div className={css.alertGrid}>{alerts.map(alert => <article className={css.alert} key={alert.key}><CircleAlert size={17}/><div><h3>{w(alert.key)}</h3><p>{t(alert.key === "opening" ? "executive.accountCount" : "executive.count", { count: alert.count })}</p>{alert.amounts ? <Values values={alert.amounts}/> : null}<More href={alert.href}>{w("source")}</More>{alert.key === "unclassified" ? <More href="/finance/expenses/claims">{w("reimbursement")}</More> : null}</div></article>)}</div>{!alerts.length ? <p className={css.empty}>{!data ? "—" : partial ? w("partial") : w("none")}</p> : null}
   </Section>
   <Section name="trace" help={w("traceHelp")} icon={<FileText size={18}/>} tone="blue">
    <div className={css.trace}>{sourceRows.map(row => <article key={row.key}><time>{date(row.date)}</time><div><small>{row.type}</small><strong>{row.title}</strong></div><Values values={[{ currency: row.currency, amount: row.amount }]}/>{row.href ? <More href={row.href}>{w("source")}</More> : "—"}</article>)}{!sourceRows.length ? <p className={css.empty}>{data?.economic.status === "ready" ? w("empty") : "—"}</p> : null}</div>
   </Section>
  </div><aside className={css.guide}><h2><Info size={20}/>{w("principles")}</h2>{["Cash", "Economic", "Liability", "Tax", "Transfer"].map((key, i) => <p key={key}><span data-color={i}/>{w(`rule${key}`)}</p>)}<More href={routes.statement}>Statement</More></aside></div>
  {detail === "accounts" && balances ? <DetailModal open title={w("accounts")} onClose={() => setDetail(null)}><p className={css.note}>{w("current")} · {w("visible")}</p>{balances.accounts.map(account => <div className={css.account} key={`${account.kind}:${account.account_id}`}><AccountIdentity account={account}/><div><strong>{accountName(account, locale)}</strong>{!account.known ? <p className={css.notice}>{w("unknown")}</p> : null}<More href={accountHref(account)}>Statement</More></div><Values values={[{ currency: account.currency, amount: account.known ? account.system_balance : null }]}/></div>)}{!balances.accounts.length ? w("empty") : null}</DetailModal> : null}
  {detail === "vat" && tax ? <DetailModal open title={w("source")} onClose={() => setDetail(null)} size="workflow"><VatSources data={tax.month}/></DetailModal> : null}
 </PageShell>;
}
