"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleCheck, Clock, FileText, Plus, RefreshCw, Search, ShieldCheck, Wallet } from "lucide-react";
import { Callout, FieldGroup, PageShell } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { supabase } from "../../../lib/supabase";
import { readExpenses, readExpenseLookups, readExpenseRequests } from "./data";
import { emptyLookups, expenseError, expenseHref, expensePaymentState, expenseShortRef, expenseSummary, pendingExpenseTax, type Expense, type ExpenseAccess, type ExpenseData, type ExpenseLookups } from "./shared";
import { ExpenseFactsForm, ExpensePaymentPanel, ExpenseSettlementForm, ExpenseTaxForm, type ExpenseRun } from "./forms";
import { ExpenseAdminTools } from "./admin-tools";
import { ExpenseRequestModal } from "./request-modal";
import { ExpenseCreateModal } from "./create-modal";
import { ExpenseRequestReview, ExpenseRequestRow } from "./request-view";
import { CompanyExpenseList } from "./company-list";
import { CompanyItemReview, CompanyRequestReview } from "./company-review";
import { expenseQueueEntries, type ExpenseRequest } from "./requests";
import { expenseCategoryLabel } from "./categories";
import { claimWorkflowTime, expenseWorkflowTime, type QueueOrder } from "../workflow-time";
import { QueueSort, WorkflowDate } from "../workflow-time-ui";
import { companyPayee } from "./company-workflow";
import { expenseStatusTone } from "./presentation";
import { ExpenseActivity } from "./audit-view";
import css from "./expenses.module.css";

export function ExpenseBadge({ state }: { state: string }) {
 const { t } = useI18n();
 const tone = expenseStatusTone(state);
 return <span className={css.badge} data-tone={tone}>{t(`expenses.${state}`)}</span>;
}
export function ExpenseWorkspace({ id, claims = false, initialTaxFilter = false, fixture, fixtureLookups }: { id?: string; claims?: boolean; initialTaxFilter?: boolean; fixture?: ExpenseData; fixtureLookups?: ExpenseLookups }) {
 const { t, locale } = useI18n(), router = useRouter(), lock = useRef(false), seq = useRef(0);
 const [data, setData] = useState<ExpenseData | null>(fixture || null), [lookups, setLookups] = useState(fixtureLookups || emptyLookups), [loading, setLoading] = useState(!fixture), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
 const [createOpen, setCreateOpen] = useState(false);
 const params = useSearchParams();
 const [requestId, setRequestId] = useState<string | null>(params.get("request")), [editRequestId, setEditRequestId] = useState<string | null>(null);
 const load = useCallback(async (preserveContext = false) => {
  if (fixture) return;
  const current = ++seq.current; if (!preserveContext) setLoading(true); setError("");
  try {
   const next = await readExpenses(id && id !== "new" ? id : null, claims);
   if (!id) next.requests = await readExpenseRequests(claims) ?? undefined;
   if (current !== seq.current) return;
   setData(next);
   try { const values = await readExpenseLookups(next.access.can_view_all, next.access.user_id); if (current === seq.current) setLookups(values); } catch { if (current === seq.current) setError("failed"); }
  } catch (e) { if (current === seq.current) { if (!preserveContext) setData(null); setError(preserveContext ? "refreshAfterSaveFailed" : expenseError(e)); } }
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
   await load(!id); setNotice("saved"); return typeof r.data === "string" ? r.data : null;
  } catch (e) { setError(expenseError(e)); return null; }
  finally { lock.current = false; setBusy(false); }
 };
 const access = data?.access, record = data?.record, creating = id === "new";
 const canCreate = claims ? access?.can_claim : access?.company_declaration_without_account_supported ? access.can_create_company === true : access?.can_manage || access?.can_record;
 const openCreate = () => { if (!canCreate || loading || busy) return; setError(""); setNotice(""); setCreateOpen(true); };
 const title = id && id !== "new" ? claims ? "claimReview" : "financeReview" : claims ? "claims" : "companyTitle";
 const selectedRequest = data?.requests?.find(r => r.id === requestId && r.kind === (claims ? "employee_claim" : "company_expense_batch"));
 return <PageShell><div className={css.page}>
  <div className={css.breadcrumb}><span>{t("common.nav.finance")}</span><span aria-hidden="true">/</span><Link href={claims ? "/finance/expenses/claims" : "/finance/expenses"}>{t(claims ? "expenses.claims" : "expenses.companyTitle")}</Link>{record ? <><span aria-hidden="true">/</span><span>{expenseShortRef(record.id)}</span></> : null}</div>
  <header className={css.heading}><div className={css.title}><span className={css.icon}><FileText size={23} aria-hidden="true" /></span><div><h1>{t(`expenses.${title}`)}</h1><p>{t(claims ? "expenses.claimHelp" : "expenses.companySubtitle")}</p></div></div>
   <div className={css.actions}>{id ? <Link className={ui.secondary} href={claims ? "/finance/expenses/claims" : "/finance/expenses"}><ArrowLeft size={17} aria-hidden="true" />{t("expenses.back")}</Link> : canCreate ? <button type="button" className={ui.primary} aria-haspopup="dialog" disabled={loading || busy} onClick={openCreate}><Plus size={17} aria-hidden="true" />{t(claims ? "expenses.newClaim" : "expenses.new")}</button> : null}
    <button type="button" className={ui.secondary} title={t("expenses.refresh")} aria-label={t("expenses.refresh")} disabled={loading || busy} onClick={() => void load()}><RefreshCw size={17} aria-hidden="true" /></button></div></header>
  {error && !createOpen ? <Callout tone="negative" role="alert">{t(`expenses.${error}`)}</Callout> : null}{notice ? <Callout tone="success" role="status">{t(`expenses.${notice}`)}</Callout> : null}
  {loading ? <p role="status">{t("expenses.loading")}</p> : data && access ? <>
   {creating ? canCreate ? <ExpenseFactsForm claim={claims} access={access} accounts={data.accounts} lookups={lookups} run={run} busy={busy} /> : <Callout tone="warning">{t("expenses.denied")}</Callout> : record ?
    <ExpenseDetail key={`${record.id}:${record.version}:${record.tax_review?.id}:${record.settlement?.id}:${record.payout?.version}:${record.obligation?.waived}`} data={data} row={record} lookups={lookups} run={run} busy={busy} /> : !id ? <>
     {claims ? <ExpenseClaimList access={access} rows={data.rows} requests={data.requests} onRequest={setRequestId} canCreate={access.can_claim} viewAll={access.can_view_all} onCreate={openCreate} /> : <CompanyExpenseList access={access} requests={data.requests || []} onRequest={setRequestId} initialTaxFilter={initialTaxFilter} />}
     {!claims && data.accounts.some(a => a.can_view_balance || a.can_view_movements) && !access.can_view_all ? <section className={css.section}><h2>{t("expenses.movements")}</h2><div className={css.stats}>{data.accounts.map(a => <div key={a.id} className={css.stat}><Wallet size={20} /><div>{a.name}<strong>{a.can_view_balance ? a.balance == null ? t("expenses.unavailable") : `${a.balance.toLocaleString(locale, { minimumFractionDigits: 2 })} THB` : t("expenses.balancePrivate")}</strong>{a.can_view_movements ? <ScopedMovements bank={a.bank_account_id} cash={a.cash_location_id} fixture={!!fixture} /> : null}</div></div>)}</div></section> : null}
     {claims && access.is_admin ? <ExpenseAdminTools access={access} accounts={data.accounts} lookups={lookups} run={run} busy={busy} fixture={!!fixture} showAuthorities={!claims} onBridge={value => router.push(`/finance/expenses/claims/${value}`)} /> : null}
    </> : <Callout tone="warning">{t("expenses.denied")}</Callout>}
  </> : null}
  {(createOpen || editRequestId) && !id && data && access ? data.requests ? <ExpenseRequestModal request={data.requests.find(r => r.id === editRequestId)} claim={editRequestId ? data.requests.find(r => r.id === editRequestId)?.kind === "employee_claim" : claims} access={access} accounts={data.accounts} lookups={lookups} run={run} busy={busy} error={error} onClose={() => { setCreateOpen(false); setEditRequestId(null); setError(""); }} onSaved={(saved, request) => { setData(old => old ? { ...old, requests: [...(old.requests || []).filter(r => r.id !== saved), request] } : old); setCreateOpen(false); setEditRequestId(null); setError(""); setRequestId(saved); }} /> : <ExpenseCreateModal claim={claims} access={access} accounts={data.accounts} lookups={lookups} run={run} busy={busy} error={error} onClose={() => { setCreateOpen(false); setError(""); }} onSaved={() => setCreateOpen(false)} /> : null}
  {selectedRequest && !editRequestId && data && access ? claims ? <ExpenseRequestReview request={selectedRequest} access={access} busy={busy} error={error} run={run} onClose={() => { setRequestId(null); setError(""); }} onEdit={() => setEditRequestId(requestId)} renderItem={row => <ExpenseDetail key={`${row.id}:${row.version}:${row.tax_review?.id}:${row.settlement?.id}:${row.payout?.version}:${row.obligation?.waived}`} data={data} row={row} lookups={lookups} run={run} busy={busy} />} /> : <CompanyRequestReview key={selectedRequest.id} request={selectedRequest} access={access} accounts={data.accounts} lookups={lookups} busy={busy} error={error} run={run} onClose={() => { setRequestId(null); setError(""); }} onEdit={() => setEditRequestId(requestId)} /> : null}
 </div></PageShell>;
}

export function ExpenseClaimList({ rows, access, requests = [], onRequest = () => {}, canCreate, viewAll, onCreate }: { rows: Expense[]; access?: ExpenseAccess; requests?: ExpenseRequest[]; onRequest?: (id: string) => void; canCreate: boolean; viewAll: boolean; onCreate: () => void }) {
 const { t, locale, date } = useI18n();
 const [search, setSearch] = useState(""), [status, setStatus] = useState("all"), [page, setPage] = useState(0);
 const [order, setOrder] = useState<QueueOrder>("newest");
 const filtered = expenseQueueEntries(rows, requests, { claims: true, status, search, locale, order, viewAll });
 const visible = filtered.slice(page * 10, page * 10 + 10);
 const money = (value: number, currency: string) => `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
 return <>
  <div className={css.filters}><FieldGroup id="claim-search" label={t("expenses.claimSearch")}><input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></FieldGroup><FieldGroup id="claim-status" label={t("expenses.status")}><select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}>{["all", "draft", "submitted", "accepted", "rejected", "unpaid", "paid"].map(s => <option key={s} value={s}>{t(`expenses.${s}`)}</option>)}</select></FieldGroup><QueueSort id="claim-queue-order" value={order} newest="newestSubmitted" onChange={v => { setOrder(v); setPage(0); }} /></div>
  <section aria-label={t(viewAll ? "expenses.allClaims" : "expenses.ownClaims")}><div className={css.sectionHead}><h2>{t(viewAll ? "expenses.allClaims" : "expenses.ownClaims")} <span>({filtered.length})</span></h2></div>
   {visible.length ? <table className={`${css.table} ${css.claimTable}`}><thead><tr>{["date", "category", "description", "requested", "approved", "status", "action"].map(k => <th key={k}>{t(`expenses.${k}`)}</th>)}</tr></thead><tbody>{visible.map(entry => { if (entry.request) return <ExpenseRequestRow access={access} key={entry.id} request={entry.request} onOpen={() => onRequest(entry.id)} />; const row = entry.expense; return <tr key={row.id}>
    <td data-label={t("expenses.date")}><span>{date(row.expense_date)}</span><small>{expenseShortRef(row.id)}</small></td>
    <td data-label={t("expenses.category")}>{expenseCategoryLabel(row.category, locale)}</td>
    <td data-label={t("expenses.description")}>{row.description}{viewAll && row.claimant_name ? <small>{row.claimant_name}</small> : null}</td>
    <td data-label={t("expenses.requested")} className={css.money}>{money(row.reimbursement_requested, row.currency)}</td>
    <td data-label={t("expenses.approved")} className={css.money}>{row.obligation ? money(row.obligation.gross_amount, row.currency) : row.settlement?.mode === "no_reimbursement" ? t("expenses.notReimbursed") : t("expenses.awaitingDecision")}</td>
    <td data-label={t("expenses.status")}><ExpenseBadge state={row.status} /><small className={css.workflowDate}><WorkflowDate value={claimWorkflowTime(row)} /></small>{row.obligation || row.payout || row.settlement?.mode === "no_reimbursement" ? <small>{t(`expenses.${expensePaymentState(row)}`)}</small> : null}</td>
    <td data-label={t("expenses.action")}><Link className={ui.secondary} href={expenseHref(row)}>{t("expenses.view")}<ArrowRight size={14} aria-hidden="true" /></Link></td>
   </tr>; })}</tbody></table> : <div className={`${css.empty} ${css.claimEmpty}`}><span className={css.icon}><FileText size={24} aria-hidden="true" /></span><h3>{t(rows.length || requests.length ? "expenses.noMatchingClaims" : "expenses.noClaims")}</h3><p>{t(rows.length || requests.length ? "expenses.adjustClaimFilters" : "expenses.noClaimsHelp")}</p>{!rows.length && !requests.length && canCreate ? <button type="button" className={ui.primary} aria-haspopup="dialog" onClick={onCreate}><Plus size={17} aria-hidden="true" />{t("expenses.newClaim")}</button> : null}</div>}
  </section>
  {filtered.length > 10 ? <div className={css.footer}><button className={ui.secondary} type="button" disabled={!page} aria-label={t("expenses.previous")} onClick={() => setPage(p => p - 1)}><ArrowLeft size={18} /></button><span>{page + 1}</span><button className={ui.secondary} type="button" disabled={(page + 1) * 10 >= filtered.length} aria-label={t("expenses.next")} onClick={() => setPage(p => p + 1)}><ArrowRight size={18} /></button></div> : null}
 </>;
}

export function ExpenseList({ rows, access, requests = [], onRequest = () => {}, claims, initialTaxFilter = false }: { rows: Expense[]; access?: ExpenseAccess; requests?: ExpenseRequest[]; onRequest?: (id: string) => void; claims: boolean; initialTaxFilter?: boolean }) {
 const { t, locale, date } = useI18n();
 const [search, setSearch] = useState(""), [state, setState] = useState(initialTaxFilter ? "tax" : "all"), [origin, setOrigin] = useState("all"), [page, setPage] = useState(0);
 const [order, setOrder] = useState<QueueOrder>("newest");
 const summary = expenseSummary([...rows, ...requests.flatMap(r => r.items)]), icons = { review: Clock, unpaid: Wallet, paid: CircleCheck, tax: ShieldCheck };
 const filtered = expenseQueueEntries(rows, requests, { claims: false, status: state, origin, search, locale, order });
 const visible = filtered.slice(page * 10, page * 10 + 10);
 return <>
  {!claims ? <div className={css.stats}>{Object.entries(summary).map(([key, value]) => { const Icon = icons[key as keyof typeof icons]; return <article className={css.stat} key={key}><span className={css.icon}><Icon size={24} aria-hidden="true" /></span><div><span>{t(`expenses.${key}`)}</span><strong>{t("expenses.count", { count: value.count })}</strong><small>{value.amount.toLocaleString(locale, { minimumFractionDigits: 2 })} THB</small></div></article>; })}</div> : null}
  <div className={css.filters}><FieldGroup id="expense-search" label={t("expenses.search")}><input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></FieldGroup>
   {!claims ? <FieldGroup id="expense-origin-filter" label={t("expenses.origin")}><select value={origin} onChange={e => { setOrigin(e.target.value); setPage(0); }}>{["all", "company_purchase", "employee_claim", "legacy_claim"].map(v => <option key={v} value={v}>{t(`expenses.${v}`)}</option>)}</select></FieldGroup> : null}
   <FieldGroup id="expense-status-filter" label={t("expenses.status")}><select value={state} onChange={e => { setState(e.target.value); setPage(0); }}>{["all", "draft", "submitted", "accepted", "rejected", "unpaid", "paid", "tax"].map(v => <option key={v} value={v}>{t(`expenses.${v}`)}</option>)}</select></FieldGroup><QueueSort id="expense-queue-order" value={order} onChange={v => { setOrder(v); setPage(0); }} /></div>
  <section><div className={css.sectionHead}><h2>{t(claims ? "expenses.allClaims" : "expenses.allExpenses")} <span>({filtered.length})</span></h2><Search size={18} aria-hidden="true" /></div>
   {visible.length ? <table className={css.table}><thead><tr>{["reference", "description", "vendor", "amount", "vat", "payment", "action"].map(k => <th key={k}>{t(`expenses.${k}`)}</th>)}</tr></thead><tbody>{visible.map(entry => { if (entry.request) return <ExpenseRequestRow access={access} key={entry.id} request={entry.request} onOpen={() => onRequest(entry.id)} />; const r = entry.expense; return <tr key={r.id}>
    <td data-label={t("expenses.reference")}><Link href={expenseHref(r)}>{expenseShortRef(r.id)}</Link><small>{t("expenses.date")}: {date(r.expense_date)}</small></td>
    <td data-label={t("expenses.description")}>{r.description}<small><ExpenseBadge state={r.origin} /></small></td><td data-label={t("expenses.vendor")}>{r.claimant_name || r.vendor_name || t("expenses.optional")}<small>{expenseCategoryLabel(r.category, locale)}</small></td>
    <td className={css.money} data-label={t("expenses.amount")}>{r.gross_amount.toLocaleString(locale, { minimumFractionDigits: 2 })}<small>{r.currency}</small></td>
    <td data-label={t("expenses.vat")}><ExpenseBadge state={r.tax_review?.vat_state || "pending"} /><small>WHT: {t(`expenses.${r.tax_review?.wht_state || "pending"}`)}</small></td>
    <td data-label={t("expenses.payment")}><ExpenseBadge state={expensePaymentState(r)} /><small>{t(`expenses.${r.status}`)}</small><small className={css.workflowDate}><WorkflowDate value={expenseWorkflowTime(r, state)} /></small></td>
    <td data-label={t("expenses.action")}><Link className={ui.secondary} href={expenseHref(r)}>{t("expenses.open")}<ArrowRight size={14} aria-hidden="true" /></Link></td>
   </tr>; })}</tbody></table> : <div className={css.empty}><strong>{t("expenses.empty")}</strong><p>{t("expenses.emptyHelp")}</p></div>}
  </section>
  {filtered.length > 10 ? <div className={css.footer}><button type="button" className={ui.secondary} disabled={!page} aria-label={t("expenses.previous")} onClick={() => setPage(p => p - 1)}><ArrowLeft size={18} /></button><span>{page + 1}</span><button type="button" className={ui.secondary} disabled={(page + 1) * 10 >= filtered.length} aria-label={t("expenses.next")} onClick={() => setPage(p => p + 1)}><ArrowRight size={18} /></button></div> : null}
 </>;
}

function ExpenseDetail({ data, row, lookups, run, busy }: { data: ExpenseData; row: Expense; lookups: ExpenseLookups; run: ExpenseRun; busy: boolean }) {
 const [dirty, setDirty] = useState(false);
 const { t, locale, date } = useI18n(), [reason, setReason] = useState(""), [waiveReason, setWaiveReason] = useState(""), [waiveAck, setWaiveAck] = useState(false);
 const access = data.access, tax = row.tax_review, money = (v: number | null | undefined) => v == null ? t("expenses.pending") : `${v.toLocaleString(locale, { minimumFractionDigits: 2 })} THB`;
 const knownPayee = companyPayee(row, lookups);
 const editable = row.status === "draft" && row.created_by === access.user_id && !row.request_id;
 if (access.company_tax_calculation_supported && row.origin === "company_purchase" && !row.personally_paid && ["submitted", "accepted"].includes(row.status)) return <>
  <CompanyItemReview row={row} access={access} accounts={data.accounts} lookups={lookups} run={run} busy={busy} />
  {row.creator_payment_fact !== "company_paid" ? <ExpensePaymentPanel row={row} access={access} accounts={data.accounts} run={run} busy={busy} /> : null}
  <ExpenseActivity row={row} isAdmin={access.is_admin} />
 </>;
 return <>{row.request_id && row.status === "draft" ? <Callout tone="info">{t(row.request_active === false ? "expenses.removedRequestItem" : "expenses.requestDraftHelp")} <Link href={`${row.origin === "employee_claim" ? "/finance/expenses/claims" : "/finance/expenses"}?request=${row.request_id}`}>{t("expenses.openRequest")}</Link></Callout> : null}<div className={css.actions}><ExpenseBadge state={row.status} /><ExpenseBadge state={row.origin} /></div><div className={css.columns}><div className={css.main}>
  <section className={css.section}>{editable ? <><ExpenseFactsForm row={row} claim={row.origin === "employee_claim"} access={access} accounts={data.accounts} lookups={lookups} run={run} busy={busy} onDirty={setDirty} /><div className={css.footer}>{dirty ? <span role="status">{t("expenses.saveBeforeSubmit")}</span> : null}<button className={ui.primary} type="button" disabled={busy || dirty} onClick={() => void run("submit_finance_expense", { p_id: row.id, p_version: row.version })}><SendIcon />{t("expenses.submit")}</button></div></> : <><h2>{t("expenses.facts")}</h2><p className={css.muted}>{t("expenses.immutableFacts")}</p><dl className={css.facts}>
   {[["reference", expenseShortRef(row.id)], ["date", date(row.expense_date)], ["vendor", row.vendor_name], ["claimant", row.request_id && row.origin === "employee_claim" ? null : row.claimant_name], ["category", expenseCategoryLabel(row.category, locale)], ["amount", money(row.gross_amount)], ["description", row.description], ["note", row.note], ["requested", row.personally_paid ? money(row.reimbursement_requested) : null], ["vatAwareness", t(`expenses.${row.vat_awareness}`)], ["whtAwareness", t(`expenses.${row.wht_awareness}`)]].filter(([, value]) => value).map(([label, value]) => <div key={label} className={label === "description" || label === "note" ? css.span : undefined}><dt>{t(`expenses.${label}`)}</dt><dd>{value}</dd></div>)}
  </dl></>}</section>
  {row.status === "submitted" && access.can_manage ? <section className={css.section}><form className={css.form} onSubmit={async e => { e.preventDefault(); await run("review_finance_expense", { p_id: row.id, p_version: row.version, p_accept: true, p_reason: reason }); }}><h2>{t("expenses.review")}</h2><FieldGroup id="expense-review-reason" label={t("expenses.reason")}><textarea required maxLength={2000} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></FieldGroup><div className={css.footer}><button className={ui.secondary} type="button" disabled={busy || !reason.trim()} onClick={() => void run("review_finance_expense", { p_id: row.id, p_version: row.version, p_accept: false, p_reason: reason })}>{t("expenses.reject")}</button><button className={ui.primary} type="submit" disabled={busy}><Check size={17} />{t("expenses.accept")}</button></div></form></section> : row.review_reason ? <div className={css.reviewBand}><p>{row.review_reason}</p></div> : row.status === "submitted" ? <Callout tone="info">{t("expenses.claimSubmittedHelp")}</Callout> : null}
  {row.status === "accepted" ? <>
   <details className={`${css.section} ${css.disclosure}`} open={pendingExpenseTax(row)}><summary>{t("expenses.taxReview")} · {t(pendingExpenseTax(row) ? "expenses.tax" : "expenses.taxReviewedStatus")}</summary>{access.can_tax_review ? <ExpenseTaxForm row={row} run={run} busy={busy} /> : <dl className={css.facts}><div><dt>{t("expenses.vat")}</dt><dd><ExpenseBadge state={tax?.vat_state || "pending"} /></dd></div><div><dt>{t("expenses.eligibility")}</dt><dd><ExpenseBadge state={tax?.eligibility || "pending"} /></dd></div><div><dt>{t("expenses.wht")}</dt><dd><ExpenseBadge state={tax?.wht_state || "pending"} /></dd></div></dl>}</details>
   <section className={css.section}>{!row.settlement && access.can_manage ? <ExpenseSettlementForm row={row} lookups={lookups} run={run} busy={busy} /> : <><h2>{t("expenses.settlement")}</h2><ExpenseBadge state={expensePaymentState(row)} /><p>{row.settlement?.reason || t("expenses.undecided")}</p></>}
    {access.can_manage && row.obligation?.source_type === "employee_reimbursement" && !row.obligation.settled && !row.obligation.waived ? <details className={css.disclosure}><summary>{t("expenses.waive")}</summary><form className={css.form} onSubmit={async e => { e.preventDefault(); await run("waive_finance_expense_reimbursement", { p_obligation: row.obligation!.id, p_reason: waiveReason, p_acknowledged: waiveAck }); }}><FieldGroup id="waive-reason" label={t("expenses.reason")}><textarea required value={waiveReason} disabled={busy} onChange={e => setWaiveReason(e.target.value)} /></FieldGroup><label className={css.check}><input type="checkbox" required checked={waiveAck} disabled={busy} onChange={e => setWaiveAck(e.target.checked)} /><span>{t("expenses.waiveAck")}</span></label><button className={ui.secondary} type="submit" disabled={busy || !waiveAck}>{t("expenses.waive")}</button></form></details> : null}
   </section></> : null}
 </div><aside className={css.aside}><h2>{t("expenses.amount")}</h2><div className={css.sum}><div><span>{t("expenses.amount")}</span><strong>{money(row.gross_amount)}</strong></div><div><span>{t("expenses.vatAmount")}</span><strong>{tax?.vat_state === "none" ? money(0) : money(tax?.vat_amount)}</strong></div><div><span>{t("expenses.eligibility")}</span><ExpenseBadge state={tax?.eligibility || "pending"} /></div><div><span>{t("expenses.wht")}</span><strong>{row.payout ? money(row.payout.wht) : tax?.wht_state === "none" ? money(0) : money(tax?.wht_amount)}</strong></div><div className={css.total}><span>{t(row.obligation ? "expenses.settlementAmount" : "expenses.amount")}</span><strong>{money(row.obligation?.gross_amount ?? row.gross_amount)}</strong></div></div>
  {tax?.wht_exception ? <div className={css.reviewBand}><p>{t("expenses.whtException")}</p></div> : null}
  <ExpensePaymentPanel row={row} access={access} accounts={data.accounts} run={run} busy={busy} />
  {knownPayee ? <dl className={css.facts}><div className={css.span}><dt>{t("expenses.payee")}</dt><dd>{knownPayee.legal_name}</dd></div></dl> : access.can_manage ? <Link className={ui.secondary} href={`/finance/payouts/new${row.settlement?.payee_id ? `?payee=${row.settlement.payee_id}` : ""}`}>{t("expenses.managePayee")}<ArrowRight size={16} /></Link> : null}
 </aside></div>
 <ExpenseActivity row={row} isAdmin={access.is_admin} />
 </>;
}
function SendIcon() { return <ArrowRight size={17} aria-hidden="true" />; }
function ScopedMovements({ bank, cash, fixture }: { bank: string | null; cash: string | null; fixture: boolean }) {
 const { t, locale, date } = useI18n(), [rows, setRows] = useState<{ id: string; occurred_at: string; direction: string; cash_amount: number }[] | null>(null), [failed, setFailed] = useState(false);
 return <details className={css.disclosure} onToggle={async e => { if (!e.currentTarget.open || rows || fixture) return; const r = await supabase.rpc("get_finance_assigned_account_movements", { p_bank: bank, p_cash: cash, p_offset: 0 }); if (r.error) setFailed(true); else setRows(r.data); }}><summary>{t("expenses.movements")}</summary>{failed ? <p role="alert">{t("expenses.failed")}</p> : rows?.map(r => <p key={r.id}>{date(r.occurred_at)}: {r.direction === "outflow" ? "-" : "+"}{r.cash_amount.toLocaleString(locale, { minimumFractionDigits: 2 })} THB</p>)}</details>;
}
