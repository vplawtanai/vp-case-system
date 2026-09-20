"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleCheck, Clock, FileText, Plus, RefreshCw, Search, ShieldCheck, Wallet } from "lucide-react";
import { Callout, FieldGroup, PageShell } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { supabase } from "../../../lib/supabase";
import { readExpenses, readExpenseLookups } from "./data";
import { emptyLookups, expenseError, expenseHref, expensePaymentState, expenseShortRef, expenseSummary, pendingExpenseTax, type Expense, type ExpenseData, type ExpenseLookups } from "./shared";
import { ExpenseFactsForm, ExpensePaymentPanel, ExpenseSettlementForm, ExpenseTaxForm, type ExpenseRun } from "./forms";
import { ExpenseAdminTools } from "./admin-tools";
import css from "./expenses.module.css";

export function ExpenseBadge({ state }: { state: string }) {
 const { t } = useI18n();
 const tone = ["accepted", "paid", "confirmed", "eligible", "none"].includes(state) ? "good" : ["rejected", "ineligible"].includes(state) ? "bad" : ["submitted", "unpaid", "pending", "undecided"].includes(state) ? "warn" : "info";
 return <span className={css.badge} data-tone={tone}>{t(`expenses.${state}`)}</span>;
}
export function ExpenseWorkspace({ id, claims = false, initialTaxFilter = false, fixture, fixtureLookups }: { id?: string; claims?: boolean; initialTaxFilter?: boolean; fixture?: ExpenseData; fixtureLookups?: ExpenseLookups }) {
 const { t, locale } = useI18n(), router = useRouter(), lock = useRef(false), seq = useRef(0);
 const [data, setData] = useState<ExpenseData | null>(fixture || null), [lookups, setLookups] = useState(fixtureLookups || emptyLookups), [loading, setLoading] = useState(!fixture), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
 const load = useCallback(async () => {
  if (fixture) return;
  const current = ++seq.current; setLoading(true); setError("");
  try {
   const next = await readExpenses(id && id !== "new" ? id : null, claims);
   if (current !== seq.current) return;
   setData(next);
   try { const values = await readExpenseLookups(next.access.can_view_all); if (current === seq.current) setLookups(values); } catch { if (current === seq.current) setError("failed"); }
  } catch (e) { if (current === seq.current) { setData(null); setError(expenseError(e)); } }
  finally { if (current === seq.current) setLoading(false); }
 }, [claims, fixture, id]);
 const invalidate = useCallback(() => { seq.current++; }, []);
 useEffect(() => { void load(); return invalidate; }, [load, invalidate]);
 const run: ExpenseRun = async (rpc, args) => {
  if (lock.current || fixture) return null;
  lock.current = true; setBusy(true); setError(""); setNotice("");
  try {
   const r = await supabase.rpc(rpc, args);
   if (r.error) throw r.error;
   await load(); setNotice("saved"); return typeof r.data === "string" ? r.data : null;
  } catch (e) { setError(expenseError(e)); return null; }
  finally { lock.current = false; setBusy(false); }
 };
 const access = data?.access, record = data?.record, creating = id === "new";
 const canCreate = claims ? access?.can_claim : access?.can_manage || access?.can_record;
 const newHref = claims ? "/finance/expenses/claims/new" : "/finance/expenses/new";
 const title = id && id !== "new" ? claims ? "claimReview" : "financeReview" : claims ? "claims" : "title";
 return <PageShell><div className={css.page}>
  <div className={css.breadcrumb}><span>{t("common.nav.finance")}</span><span aria-hidden="true">/</span><Link href={claims ? "/finance/expenses/claims" : "/finance/expenses"}>{t(claims ? "expenses.claims" : "expenses.title")}</Link>{record ? <><span aria-hidden="true">/</span><span>{expenseShortRef(record.id)}</span></> : null}</div>
  <header className={css.heading}><div className={css.title}><span className={css.icon}><FileText size={23} aria-hidden="true" /></span><div><h1>{t(`expenses.${title}`)}</h1><p>{t(claims ? "expenses.claimHelp" : "expenses.subtitle")}</p></div></div>
   <div className={css.actions}>{id ? <Link className={ui.secondary} href={claims ? "/finance/expenses/claims" : "/finance/expenses"}><ArrowLeft size={17} aria-hidden="true" />{t("expenses.back")}</Link> : canCreate ? <Link className={ui.primary} href={newHref}><Plus size={17} aria-hidden="true" />{t(claims ? "expenses.newClaim" : "expenses.new")}</Link> : null}
    <button type="button" className={ui.secondary} title={t("expenses.refresh")} aria-label={t("expenses.refresh")} disabled={loading || busy} onClick={() => void load()}><RefreshCw size={17} aria-hidden="true" /></button></div></header>
  {error ? <Callout tone="negative" role="alert">{t(`expenses.${error}`)}</Callout> : null}{notice ? <Callout tone="success" role="status">{t(`expenses.${notice}`)}</Callout> : null}
  {loading ? <p role="status">{t("expenses.loading")}</p> : data && access ? <>
   {creating ? canCreate ? <ExpenseFactsForm claim={claims} access={access} accounts={data.accounts} lookups={lookups} run={run} busy={busy} /> : <Callout tone="warning">{t("expenses.denied")}</Callout> : record ?
    <ExpenseDetail key={`${record.id}:${record.version}:${record.tax_review?.id}:${record.settlement?.id}:${record.payout?.version}:${record.obligation?.waived}`} data={data} row={record} lookups={lookups} run={run} busy={busy} /> : !id ? <>
     {claims ? <ExpenseClaimList rows={data.rows} canCreate={access.can_claim} viewAll={access.can_view_all} /> : <ExpenseList rows={data.rows} claims={false} initialTaxFilter={initialTaxFilter} />}
     {!claims && data.accounts.some(a => a.can_view_balance || a.can_view_movements) && !access.can_view_all ? <section className={css.section}><h2>{t("expenses.movements")}</h2><div className={css.stats}>{data.accounts.map(a => <div key={a.id} className={css.stat}><Wallet size={20} /><div>{a.name}<strong>{a.can_view_balance ? a.balance == null ? t("expenses.unavailable") : `${a.balance.toLocaleString(locale, { minimumFractionDigits: 2 })} THB` : t("expenses.balancePrivate")}</strong>{a.can_view_movements ? <ScopedMovements bank={a.bank_account_id} cash={a.cash_location_id} fixture={!!fixture} /> : null}</div></div>)}</div></section> : null}
     {access.is_admin ? <ExpenseAdminTools access={access} accounts={data.accounts} lookups={lookups} run={run} busy={busy} fixture={!!fixture} showAuthorities={!claims} onBridge={value => router.push(`/finance/expenses/claims/${value}`)} /> : null}
    </> : <Callout tone="warning">{t("expenses.denied")}</Callout>}
  </> : null}
 </div></PageShell>;
}

export function ExpenseClaimList({ rows, canCreate, viewAll }: { rows: Expense[]; canCreate: boolean; viewAll: boolean }) {
 const { t, locale, date } = useI18n();
 const [search, setSearch] = useState(""), [status, setStatus] = useState("all"), [page, setPage] = useState(0);
 const filtered = rows.filter(r => [r.reference, r.description, r.category, viewAll ? r.claimant_name : ""].join(" ").toLowerCase().includes(search.toLowerCase()) && (status === "all" || r.status === status || expensePaymentState(r) === status));
 const visible = filtered.slice(page * 10, page * 10 + 10);
 const money = (value: number, currency: string) => `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
 return <>
  <div className={css.filters}><FieldGroup id="claim-search" label={t("expenses.claimSearch")}><input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></FieldGroup><FieldGroup id="claim-status" label={t("expenses.status")}><select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}>{["all", "draft", "submitted", "accepted", "rejected", "unpaid", "paid"].map(s => <option key={s} value={s}>{t(`expenses.${s}`)}</option>)}</select></FieldGroup></div>
  <section aria-label={t(viewAll ? "expenses.allClaims" : "expenses.ownClaims")}><div className={css.sectionHead}><h2>{t(viewAll ? "expenses.allClaims" : "expenses.ownClaims")} <span>({filtered.length})</span></h2></div>
   {visible.length ? <table className={`${css.table} ${css.claimTable}`}><thead><tr>{["date", "category", "description", "requested", "approved", "status", "action"].map(k => <th key={k}>{t(`expenses.${k}`)}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={row.id}>
    <td data-label={t("expenses.date")}>{date(row.expense_date)}<small>{expenseShortRef(row.id)}</small></td>
    <td data-label={t("expenses.category")}>{row.category}</td>
    <td data-label={t("expenses.description")}>{row.description}{viewAll && row.claimant_name ? <small>{row.claimant_name}</small> : null}</td>
    <td data-label={t("expenses.requested")} className={css.money}>{money(row.reimbursement_requested, row.currency)}</td>
    <td data-label={t("expenses.approved")} className={css.money}>{row.obligation ? money(row.obligation.gross_amount, row.currency) : row.settlement?.mode === "no_reimbursement" ? t("expenses.notReimbursed") : t("expenses.awaitingDecision")}</td>
    <td data-label={t("expenses.status")}><ExpenseBadge state={row.status} />{row.obligation || row.payout || row.settlement?.mode === "no_reimbursement" ? <small>{t(`expenses.${expensePaymentState(row)}`)}</small> : null}</td>
    <td data-label={t("expenses.action")}><Link className={ui.secondary} href={expenseHref(row)}>{t("expenses.view")}<ArrowRight size={14} aria-hidden="true" /></Link></td>
   </tr>)}</tbody></table> : <div className={`${css.empty} ${css.claimEmpty}`}><span className={css.icon}><FileText size={24} aria-hidden="true" /></span><h3>{t(rows.length ? "expenses.noMatchingClaims" : "expenses.noClaims")}</h3><p>{t(rows.length ? "expenses.adjustClaimFilters" : "expenses.noClaimsHelp")}</p>{!rows.length && canCreate ? <Link className={ui.primary} href="/finance/expenses/claims/new"><Plus size={17} aria-hidden="true" />{t("expenses.newClaim")}</Link> : null}</div>}
  </section>
  {filtered.length > 10 ? <div className={css.footer}><button className={ui.secondary} type="button" disabled={!page} aria-label={t("expenses.previous")} onClick={() => setPage(p => p - 1)}><ArrowLeft size={18} /></button><span>{page + 1}</span><button className={ui.secondary} type="button" disabled={(page + 1) * 10 >= filtered.length} aria-label={t("expenses.next")} onClick={() => setPage(p => p + 1)}><ArrowRight size={18} /></button></div> : null}
 </>;
}

export function ExpenseList({ rows, claims, initialTaxFilter = false }: { rows: Expense[]; claims: boolean; initialTaxFilter?: boolean }) {
 const { t, locale, date } = useI18n();
 const [search, setSearch] = useState(""), [state, setState] = useState(initialTaxFilter ? "tax" : "all"), [origin, setOrigin] = useState("all"), [page, setPage] = useState(0);
 const summary = expenseSummary(rows), icons = { review: Clock, unpaid: Wallet, paid: CircleCheck, tax: ShieldCheck };
 const filtered = rows.filter(r => [r.description, r.vendor_name, r.claimant_name, r.reference, r.id].join(" ").toLowerCase().includes(search.toLowerCase()) && (origin === "all" || r.origin === origin) && (state === "all" || (state === "tax" ? pendingExpenseTax(r) : r.status === state || expensePaymentState(r) === state)));
 const visible = filtered.slice(page * 10, page * 10 + 10);
 return <>
  {!claims ? <div className={css.stats}>{Object.entries(summary).map(([key, value]) => { const Icon = icons[key as keyof typeof icons]; return <article className={css.stat} key={key}><span className={css.icon}><Icon size={24} aria-hidden="true" /></span><div><span>{t(`expenses.${key}`)}</span><strong>{t("expenses.count", { count: value.count })}</strong><small>{value.amount.toLocaleString(locale, { minimumFractionDigits: 2 })} THB</small></div></article>; })}</div> : null}
  <div className={css.filters}><FieldGroup id="expense-search" label={t("expenses.search")}><input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></FieldGroup>
   {!claims ? <FieldGroup id="expense-origin-filter" label={t("expenses.origin")}><select value={origin} onChange={e => { setOrigin(e.target.value); setPage(0); }}>{["all", "company_purchase", "employee_claim", "legacy_claim"].map(v => <option key={v} value={v}>{t(`expenses.${v}`)}</option>)}</select></FieldGroup> : null}
   <FieldGroup id="expense-status-filter" label={t("expenses.status")}><select value={state} onChange={e => { setState(e.target.value); setPage(0); }}>{["all", "draft", "submitted", "accepted", "rejected", "unpaid", "paid", "tax"].map(v => <option key={v} value={v}>{t(`expenses.${v}`)}</option>)}</select></FieldGroup></div>
  <section><div className={css.sectionHead}><h2>{t(claims ? "expenses.allClaims" : "expenses.allExpenses")} <span>({filtered.length})</span></h2><Search size={18} aria-hidden="true" /></div>
   {visible.length ? <table className={css.table}><thead><tr>{["reference", "description", "vendor", "amount", "vat", "payment", "action"].map(k => <th key={k}>{t(`expenses.${k}`)}</th>)}</tr></thead><tbody>{visible.map(r => <tr key={r.id}>
    <td data-label={t("expenses.reference")}><Link href={expenseHref(r)}>{expenseShortRef(r.id)}</Link><small>{date(r.expense_date)}</small></td>
    <td data-label={t("expenses.description")}>{r.description}<small><ExpenseBadge state={r.origin} /></small></td><td data-label={t("expenses.vendor")}>{r.claimant_name || r.vendor_name || t("expenses.optional")}<small>{r.category}</small></td>
    <td className={css.money} data-label={t("expenses.amount")}>{r.gross_amount.toLocaleString(locale, { minimumFractionDigits: 2 })}<small>{r.currency}</small></td>
    <td data-label={t("expenses.vat")}><ExpenseBadge state={r.tax_review?.vat_state || "pending"} /><small>WHT: {t(`expenses.${r.tax_review?.wht_state || "pending"}`)}</small></td>
    <td data-label={t("expenses.payment")}><ExpenseBadge state={expensePaymentState(r)} /><small>{t(`expenses.${r.status}`)}</small></td>
    <td data-label={t("expenses.action")}><Link className={ui.secondary} href={expenseHref(r)}>{t("expenses.open")}<ArrowRight size={14} aria-hidden="true" /></Link></td>
   </tr>)}</tbody></table> : <div className={css.empty}><strong>{t("expenses.empty")}</strong><p>{t("expenses.emptyHelp")}</p></div>}
  </section>
  {filtered.length > 10 ? <div className={css.footer}><button type="button" className={ui.secondary} disabled={!page} aria-label={t("expenses.previous")} onClick={() => setPage(p => p - 1)}><ArrowLeft size={18} /></button><span>{page + 1}</span><button type="button" className={ui.secondary} disabled={(page + 1) * 10 >= filtered.length} aria-label={t("expenses.next")} onClick={() => setPage(p => p + 1)}><ArrowRight size={18} /></button></div> : null}
 </>;
}

function ExpenseDetail({ data, row, lookups, run, busy }: { data: ExpenseData; row: Expense; lookups: ExpenseLookups; run: ExpenseRun; busy: boolean }) {
 const [dirty, setDirty] = useState(false);
 const { t, locale, date } = useI18n(), [reason, setReason] = useState(""), [waiveReason, setWaiveReason] = useState(""), [waiveAck, setWaiveAck] = useState(false);
 const access = data.access, tax = row.tax_review, money = (v: number | null | undefined) => v == null ? t("expenses.pending") : `${v.toLocaleString(locale, { minimumFractionDigits: 2 })} THB`;
 const editable = row.status === "draft" && row.created_by === access.user_id;
 return <><div className={css.actions}><ExpenseBadge state={row.status} /><ExpenseBadge state={row.origin} /></div><div className={css.columns}><div className={css.main}>
  <section className={css.section}>{editable ? <><ExpenseFactsForm row={row} claim={row.origin === "employee_claim"} access={access} accounts={data.accounts} lookups={lookups} run={run} busy={busy} onDirty={setDirty} /><div className={css.footer}>{dirty ? <span role="status">{t("expenses.saveBeforeSubmit")}</span> : null}<button className={ui.primary} type="button" disabled={busy || dirty} onClick={() => void run("submit_finance_expense", { p_id: row.id, p_version: row.version })}><SendIcon />{t("expenses.submit")}</button></div></> : <><h2>{t("expenses.facts")}</h2><p className={css.muted}>{t("expenses.immutableFacts")}</p><dl className={css.facts}>
   {[["reference", expenseShortRef(row.id)], ["date", date(row.expense_date)], ["vendor", row.vendor_name], ["claimant", row.claimant_name], ["category", row.category], ["amount", money(row.gross_amount)], ["description", row.description], ["note", row.note], ["requested", row.personally_paid ? money(row.reimbursement_requested) : null], ["vatAwareness", t(`expenses.${row.vat_awareness}`)], ["whtAwareness", t(`expenses.${row.wht_awareness}`)]].filter(([, value]) => value).map(([label, value]) => <div key={label} className={label === "description" || label === "note" ? css.span : undefined}><dt>{t(`expenses.${label}`)}</dt><dd>{value}</dd></div>)}
  </dl></>}</section>
  {row.status === "submitted" && access.can_manage ? <section className={css.section}><form className={css.form} onSubmit={async e => { e.preventDefault(); await run("review_finance_expense", { p_id: row.id, p_version: row.version, p_accept: true, p_reason: reason }); }}><h2>{t("expenses.review")}</h2><FieldGroup id="expense-review-reason" label={t("expenses.reason")}><textarea required maxLength={2000} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></FieldGroup><div className={css.footer}><button className={ui.secondary} type="button" disabled={busy || !reason.trim()} onClick={() => void run("review_finance_expense", { p_id: row.id, p_version: row.version, p_accept: false, p_reason: reason })}>{t("expenses.reject")}</button><button className={ui.primary} type="submit" disabled={busy}><Check size={17} />{t("expenses.accept")}</button></div></form></section> : row.review_reason ? <div className={css.reviewBand}><p>{row.review_reason}</p></div> : row.status === "submitted" ? <Callout tone="info">{t("expenses.claimSubmittedHelp")}</Callout> : null}
  {row.status === "accepted" ? <>
   <section className={css.section}>{access.can_tax_review ? <ExpenseTaxForm row={row} run={run} busy={busy} /> : <><h2>{t("expenses.taxReview")}</h2><dl className={css.facts}><div><dt>{t("expenses.vat")}</dt><dd><ExpenseBadge state={tax?.vat_state || "pending"} /></dd></div><div><dt>{t("expenses.eligibility")}</dt><dd><ExpenseBadge state={tax?.eligibility || "pending"} /></dd></div><div><dt>{t("expenses.wht")}</dt><dd><ExpenseBadge state={tax?.wht_state || "pending"} /></dd></div></dl></>}</section>
   <section className={css.section}>{!row.settlement && access.can_manage ? <ExpenseSettlementForm row={row} lookups={lookups} run={run} busy={busy} /> : <><h2>{t("expenses.settlement")}</h2><ExpenseBadge state={expensePaymentState(row)} /><p>{row.settlement?.reason || t("expenses.undecided")}</p></>}
    {access.can_manage && row.obligation?.source_type === "employee_reimbursement" && !row.obligation.settled && !row.obligation.waived ? <details className={css.disclosure}><summary>{t("expenses.waive")}</summary><form className={css.form} onSubmit={async e => { e.preventDefault(); await run("waive_finance_expense_reimbursement", { p_obligation: row.obligation!.id, p_reason: waiveReason, p_acknowledged: waiveAck }); }}><FieldGroup id="waive-reason" label={t("expenses.reason")}><textarea required value={waiveReason} disabled={busy} onChange={e => setWaiveReason(e.target.value)} /></FieldGroup><label className={css.check}><input type="checkbox" required checked={waiveAck} disabled={busy} onChange={e => setWaiveAck(e.target.checked)} /><span>{t("expenses.waiveAck")}</span></label><button className={ui.secondary} type="submit" disabled={busy || !waiveAck}>{t("expenses.waive")}</button></form></details> : null}
   </section></> : null}
 </div><aside className={css.aside}><h2>{t("expenses.amount")}</h2><div className={css.sum}><div><span>{t("expenses.amount")}</span><strong>{money(row.gross_amount)}</strong></div><div><span>{t("expenses.vatAmount")}</span><strong>{tax?.vat_state === "none" ? money(0) : money(tax?.vat_amount)}</strong></div><div><span>{t("expenses.eligibility")}</span><ExpenseBadge state={tax?.eligibility || "pending"} /></div><div><span>{t("expenses.wht")}</span><strong>{row.payout ? money(row.payout.wht) : tax?.wht_state === "none" ? money(0) : money(tax?.wht_amount)}</strong></div><div className={css.total}><span>{t(row.obligation ? "expenses.settlementAmount" : "expenses.amount")}</span><strong>{money(row.obligation?.gross_amount ?? row.gross_amount)}</strong></div></div>
  {tax?.wht_exception ? <div className={css.reviewBand}><p>{t("expenses.whtException")}</p></div> : null}
  <ExpensePaymentPanel row={row} access={access} accounts={data.accounts} run={run} busy={busy} />
  {access.can_manage ? <Link className={ui.secondary} href={`/finance/payouts/new${row.settlement?.payee_id ? `?payee=${row.settlement.payee_id}` : ""}`}>{t("expenses.managePayee")}<ArrowRight size={16} /></Link> : null}
 </aside></div>
 <section className={css.section}><h2>{t("expenses.audit")}</h2>{row.audit.length ? <ul className={css.audit}>{row.audit.map(a => <li key={a.id}><div>{t(`expenses.${a.event_type === "saved" ? "savedEvent" : a.event_type}`)}<small>{a.actor_name}</small>{access.is_admin && a.evidence_json ? <details className={css.disclosure}><summary>{t("expenses.raw")}</summary><pre className={css.raw}>{JSON.stringify(a.evidence_json, null, 2)}</pre></details> : null}</div><time>{date(a.created_at, true)}</time></li>)}</ul> : <p className={css.muted}>{t("expenses.noHistory")}</p>}</section>
 </>;
}
function SendIcon() { return <ArrowRight size={17} aria-hidden="true" />; }
function ScopedMovements({ bank, cash, fixture }: { bank: string | null; cash: string | null; fixture: boolean }) {
 const { t, locale, date } = useI18n(), [rows, setRows] = useState<{ id: string; occurred_at: string; direction: string; cash_amount: number }[] | null>(null), [failed, setFailed] = useState(false);
 return <details className={css.disclosure} onToggle={async e => { if (!e.currentTarget.open || rows || fixture) return; const r = await supabase.rpc("get_finance_assigned_account_movements", { p_bank: bank, p_cash: cash, p_offset: 0 }); if (r.error) setFailed(true); else setRows(r.data); }}><summary>{t("expenses.movements")}</summary>{failed ? <p role="alert">{t("expenses.failed")}</p> : rows?.map(r => <p key={r.id}>{date(r.occurred_at)}: {r.direction === "outflow" ? "-" : "+"}{r.cash_amount.toLocaleString(locale, { minimumFractionDigits: 2 })} THB</p>)}</details>;
}
