"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, RefreshCw } from "lucide-react";
import { Callout, FieldGroup, PageShell } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { PayableGroups } from "./groups";
import { payableQueueSummary, type PayableGroup } from "./shared";
import { ExpensePayableDetail } from "./expense-detail";
import { ExpenseBadge } from "../expenses/workspace";
import type { ExpenseObligation } from "../expenses/shared";
import css from "../expenses/expenses.module.css";
import styles from "./payables.module.css";
import { PayableSourceBadge, PayableSourceHeading, RecipientAvatar } from "./source-identity";
import { payableQueueEntries, type QueueOrder } from "../workflow-time";
import { QueueSort, WorkflowDate } from "../workflow-time-ui";

export function MultiSourcePayables({ canReadRevenue, canReadExpense, isAdmin, fixture }: { canReadRevenue: boolean; canReadExpense: boolean; isAdmin: boolean; fixture?: { revenue: PayableGroup[]; expenses: ExpenseObligation[] } }) {
 const { t, locale } = useI18n(), seq = useRef(0);
 const [data, setData] = useState(fixture || null), [error, setError] = useState(false), [loading, setLoading] = useState(!fixture), [source, setSource] = useState("all"), [search, setSearch] = useState("");
 const [order, setOrder] = useState<QueueOrder>("newest");
 const load = useCallback(async () => {
  if (fixture) return;
  const current = ++seq.current; setLoading(true); setError(false); setData(null);
  try {
   const revenue: PayableGroup[] = [], expenses: ExpenseObligation[] = [];
   if (canReadRevenue) for (let start = 0; ; start += 25) {
    if (start > 100000) throw new Error("limit");
    const r = await supabase.rpc("get_finance_payable_entitlements", { p_search: "", p_source_type: "all", p_bucket: "all", p_status: "open", p_offset: start });
    if (r.error || !Array.isArray(r.data?.groups)) throw r.error || new Error("response");
    revenue.push(...r.data.groups); if (!r.data.has_next) break;
   }
   if (canReadExpense) for (let start = 0; ; start += 50) {
    if (start > 100000) throw new Error("limit");
    const r = await supabase.rpc("get_finance_expense_obligations", { p_offset: start });
    if (r.error || !Array.isArray(r.data?.rows)) throw r.error || new Error("response");
    expenses.push(...r.data.rows); if (!r.data.has_next) break;
   }
   if (current === seq.current) setData({ revenue, expenses });
  } catch { if (current === seq.current) setError(true); }
  finally { if (current === seq.current) setLoading(false); }
 }, [canReadExpense, canReadRevenue, fixture]);
 const invalidate = useCallback(() => { seq.current++; }, []);
 useEffect(() => { void load(); return invalidate; }, [load, invalidate]);
 const revenue = data?.revenue.filter(g => ["all", "revenue_distribution"].includes(source) && g.recipient_name.toLowerCase().includes(search.toLowerCase())) || [];
 const expenses = data?.expenses.filter(e => e.status === "open" && (source === "all" || e.source_type === source) && [e.payee_name, e.description, e.reference].join(" ").toLowerCase().includes(search.toLowerCase())) || [];
 const amounts = new Map(payableQueueSummary(revenue).amounts.map(a => [a.currency, Math.round(a.amount * 100)]));
 for (const e of expenses) amounts.set(e.currency, (amounts.get(e.currency) || 0) + Math.round(e.gross_amount * 100));
 const total = [...amounts].map(([currency, cents]) => `${(cents / 100).toLocaleString(locale, { minimumFractionDigits: 2 })} ${currency}`).join(" / ") || "0.00 THB";
 const recipients = new Set([...revenue.map(g => g.recipient_id), ...expenses.map(e => e.payee_id)]).size;
 const entries = payableQueueEntries(revenue, expenses, order);
 return <PageShell><div className={css.page}><header className={css.heading}><div className={css.title}><span className={css.icon}><FileText size={23} /></span><div><h1>{t("payables.title")}</h1><p>{t("expenses.payablesHelp")}</p></div></div><button type="button" className={ui.secondary} aria-label={t("expenses.refresh")} title={t("expenses.refresh")} disabled={loading} onClick={() => void load()}><RefreshCw size={17} /></button></header>
  <div className={`${css.stats} ${css.payableStats}`}><article className={css.stat}><div>{t("payables.total")}<strong>{data ? total : "-"}</strong></div></article><article className={css.stat}><div>{t("payables.recipients")}<strong>{data ? t("payables.peopleCount", { count: recipients }) : "-"}</strong></div></article><article className={css.stat}><div>{t("expenses.payableItems")}<strong>{data ? t("expenses.count", { count: revenue.reduce((sum, g) => sum + g.components.length, 0) + expenses.length }) : "-"}</strong></div></article></div>
  <div className={css.filters}><FieldGroup id="outgoing-search" label={t("expenses.search")}><input type="search" value={search} onChange={e => setSearch(e.target.value)} /></FieldGroup><FieldGroup id="outgoing-source" label={t("expenses.origin")}><select value={source} onChange={e => setSource(e.target.value)}>{["all", ...(canReadRevenue ? ["revenue_distribution"] : []), ...(canReadExpense ? ["employee_reimbursement", "supplier_payable"] : [])].map(k => <option key={k} value={k}>{t(`expenses.${k}`)}</option>)}</select></FieldGroup><QueueSort id="payable-queue-order" value={order} newest="newestReady" onChange={setOrder} /></div>
  {error ? <Callout tone="negative" role="alert">{t("expenses.failed")}</Callout> : loading ? <p role="status">{t("expenses.loading")}</p> : <>
   {entries.map((entry, index) => <section key={entry.key} data-payable-queue={entry.key}>
    {index === 0 || entries[index - 1].source !== entry.source ? <PayableSourceHeading source={entry.source} /> : null}
    {entry.source === "revenue_distribution" ? <PayableGroups groups={[entry.group]} isAdmin={isAdmin} /> : <ExpenseObligationQueue rows={entry.rows} showHeading={false} isAdmin={isAdmin} />}
   </section>)}
   {!expenses.length && !revenue.length ? <div className={css.empty}><strong>{t("expenses.empty")}</strong><p>{t("expenses.emptyHelp")}</p></div> : null}
  </>}
 </div></PageShell>;
}
export function ExpenseObligationQueue({ rows, showHeading = true, isAdmin = false }: { rows: ExpenseObligation[]; showHeading?: boolean; isAdmin?: boolean }) {
 const { t, locale, date } = useI18n(), [selectedId, setSelected] = useState(rows[0]?.id);
 const [detailId, setDetail] = useState<string | null>(null), detail = rows.find(r => r.id === detailId);
 const selected = rows.find(r => r.id === selectedId) || rows[0], money = (value: number) => `${value.toLocaleString(locale, { minimumFractionDigits: 2 })} THB`;
 if (!selected) return null;
 return <section>{showHeading ? <PayableSourceHeading source={rows[0].source_type} /> : null}<div className={css.queue}><div className={css.queueList}>{rows.map(r => <article key={`${r.source_type}:${r.id}`} className={`${css.queueRow} ${selected?.id === r.id ? css.selected : ""}`}><div className={styles.identity}><RecipientAvatar kind={r.source_type === "employee_reimbursement" ? "person" : "supplier"} /><div><h3 className={styles.queueName}>{r.payee_name}</h3><PayableSourceBadge source={r.source_type} /><p>{r.description}</p><small className={css.workflowDate}><WorkflowDate value={{ event: "readyToPay", at: r.created_at }} /></small></div></div><div><strong>{money(r.gross_amount)}</strong><p><button type="button" className={ui.secondary} aria-haspopup="dialog" onClick={() => { setSelected(r.id); setDetail(r.id); }}>{t("expenses.view")}</button></p></div></article>)}</div>
  {selected ? <aside className={css.queueDetail} aria-label={t(`expenses.${selected.source_type}`)}><h3>{t("expenses.paymentReview")}</h3><ExpenseBadge state="unpaid" /><dl className={css.facts}><div className={css.span}><dt>{t("expenses.payee")}</dt><dd>{selected.payee_name}</dd></div><div className={css.span}><dt>{t("expenses.description")}</dt><dd>{selected.description}</dd></div><div><dt>{t("expenses.settlementAmount")}</dt><dd><strong>{money(selected.gross_amount)}</strong></dd></div><div><dt>{t("expenses.due")}</dt><dd>{selected.due_on ? date(selected.due_on) : t("expenses.optional")}</dd></div></dl><Link className={ui.primary} href={`/finance/expenses/${selected.source_type === "employee_reimbursement" ? "claims/" : ""}${selected.expense_id}#payment`}>{t("expenses.preparePayment")}<ArrowRight size={17} /></Link><p className={css.muted}>{t("expenses.obligationHelp")}</p></aside> : null}
 </div>{detail ? <ExpensePayableDetail key={detail.id} obligation={detail} isAdmin={isAdmin} onClose={() => setDetail(null)} /> : null}</section>;
}
