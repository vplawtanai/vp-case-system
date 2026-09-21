"use client";
import { useRef, useState } from "react";
import { Copy, Pencil, Plus, Save, Send, Trash2 } from "lucide-react";
import DetailModal from "../../components/DetailModal";
import { Callout, FieldGroup } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { ExpenseFactsForm, type ExpenseRun } from "./forms";
import { expenseCategoryLabel } from "./categories";
import type { Expense, ExpenseAccess, ExpenseAccount, ExpenseLookups } from "./shared";
import type { ExpenseRequest, RequestItemInput } from "./requests";
import css from "./expenses.module.css";
import company from "./company.module.css";
import { readExpenseRequest } from "./data";
import { hasReimbursement } from "./request-operations";

type Props = { request?: ExpenseRequest; claim: boolean; access: ExpenseAccess; accounts: ExpenseAccount[]; lookups: ExpenseLookups; run: ExpenseRun; busy: boolean; error: string; onClose: () => void; onSaved: (id: string, request: ExpenseRequest) => void };
export function requestItemFromExpense(row: Expense): RequestItemInput {
 const keys = ["expense_date", "category", "description", "gross_amount", "vendor_name", "supplier_payee_id", "claimant_id", "client_id", "case_id", "advisory_matter_id", "note", "personally_paid", "reimbursement_requested", "vat_awareness", "wht_awareness"] as const;
 return { id: row.id, version: row.version, input: { ...Object.fromEntries(keys.map(k => [k, row[k]])), ...row.request_entry_account, ...(row.creator_payment_fact === undefined ? {} : { creator_payment_fact: row.creator_payment_fact }) } };
}
// Local editor values only: no server event/history is invented for an unsaved line.
function editorRow(item: RequestItemInput, claim: boolean): Expense {
 return { id: item.id, reference: "", origin: claim ? "employee_claim" : "company_purchase", legacy_claim_id: null, status: "draft", version: item.version || 0, currency: "THB", created_by: "", created_at: "", submitted_at: null, review_reason: null, claimant_name: null, tax_review: null, settlement: null, obligation: null, payout: null, audit: [], expense_date: "", description: "", category: "", gross_amount: 0, reimbursement_requested: 0, personally_paid: claim, vat_awareness: "unknown", wht_awareness: "unknown", note: "", claimant_id: null, vendor_name: null, supplier_payee_id: null, client_id: null, case_id: null, advisory_matter_id: null, ...item.input, request_entry_account: { bank_account_id: String(item.input.bank_account_id || ""), cash_location_id: String(item.input.cash_location_id || "") } };
}
export function ExpenseRequestModal({ request, claim, access, accounts, lookups, run, busy, error, onClose, onSaved }: Props) {
 const { t, locale, date } = useI18n();
 const [id] = useState(() => request?.id || crypto.randomUUID());
 const [items, setItems] = useState<RequestItemInput[]>(() => request?.items.map(requestItemFromExpense) || []);
 const [editing, setEditing] = useState<string | null>(() => request ? null : crypto.randomUUID());
 const [note, setNote] = useState(request?.note || ""), [dirty, setDirty] = useState(false), [editorDirty, setEditorDirty] = useState(false), [confirmClose, setConfirmClose] = useState(false);
 const operation = useRef<{ args: Record<string, unknown>; saved: boolean } | null>(null);
 const lock = useRef(false);
 const [working, setWorking] = useState(false), [checkpoint, setCheckpoint] = useState(false), [savedDraft, setSavedDraft] = useState<ExpenseRequest | null>(null), [localError, setLocalError] = useState("");
 const blocked = busy || working || checkpoint;
 const creator = (savedDraft || request)?.requester_name || lookups.people.find(p => p.id === access.user_id)?.name || t("expenses.currentUser");
 const reimbursement = hasReimbursement(claim, items.map(i => i.input));
 const edited = items.find(i => i.id === editing);
 const money = (v: number) => `${v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
 const total = (key: string) => items.reduce((n, item) => n + Math.round(Number(item.input[key] || 0) * 100), 0) / 100;
 const close = () => { if (busy || lock.current) return; if (dirty || editorDirty || checkpoint) setConfirmClose(true); else onClose(); };
 async function save(submit = false) {
  if (busy || lock.current || editing || !items.length) return;
  lock.current = true; setWorking(true); setCheckpoint(true); setLocalError("");
  // Keep the same payload/operation after an uncertain response. Never save twice to retry Submit.
  if (!operation.current) operation.current = { args: { p_id: id, p_version: request?.version ?? null, p_kind: claim ? "employee_claim" : "company_expense_batch", p_note: note, p_items: items, p_operation: crypto.randomUUID() }, saved: false };
  try {
   if (!operation.current.saved) {
    const saved = await run("save_finance_expense_request", operation.current.args);
    if (!saved) return;
    operation.current.saved = true;
   }
   const fresh = await readExpenseRequest(id);
   setSavedDraft(fresh);
   if (!submit || fresh.status === "submitted") { onSaved(id, fresh); return; }
   // Another tab may have edited the saved Draft. Do not submit an unseen revision.
   if (fresh.version !== Number(operation.current.args.p_version ?? 0) + 1) { setLocalError("stale"); return; }
   if (await run("submit_finance_expense_request", { p_id: id, p_version: fresh.version })) {
    const submitted = await readExpenseRequest(id);
    if (submitted.status !== "submitted") throw new Error("request not submitted");
    onSaved(id, submitted);
   }
  } catch { setLocalError("requestRetry"); }
  finally { lock.current = false; setWorking(false); }
 }
 return <>
  <DetailModal open size={claim ? "workflow" : "detail"} title={t(claim ? "expenses.newClaimRequest" : "expenses.companyNewRequest")} onClose={close} closeOnBackdrop={false}
   footer={<div className={css.createFooter}><button type="button" className={ui.secondary} disabled={busy || working} onClick={close}>{t("common.actions.close")}</button><button type="button" className={ui.secondary} disabled={busy || working || !!editing || !items.length} onClick={() => void save()}><Save size={17} />{t("expenses.saveForLater")}</button><button type="button" className={ui.primary} disabled={busy || working || !!editing || !items.length} onClick={() => void save(true)}><Send size={17} />{t(claim ? "expenses.submitRequest" : "expenses.sendForReview")}</button></div>}>
   <div className={`${css.page} ${claim ? "" : company.create}`}>
    {localError || error ? <Callout tone="negative" role="alert">{t(`expenses.${localError || error}`)} {checkpoint && !localError ? t("expenses.requestRetry") : null}</Callout> : null}
    <div className={css.requestMetadata}><span>{t(claim ? "expenses.requestClaimant" : "expenses.recordedBy")}: <strong>{creator}</strong></span>{(savedDraft || request)?.created_at ? <span>{t("expenses.draftCreatedAt")}: {date((savedDraft || request)!.created_at, true)}</span> : null}</div>
    <section className={`${css.requestSummary} ${claim ? "" : company.createSummary}`} aria-label={t("expenses.requestSummary")}>
     {claim ? <h2>{t("expenses.requestItems")}</h2> : null}
     <dl className={css.requestTotals} aria-live="polite"><div><dt>{t("expenses.itemCount")}</dt><dd>{t("expenses.count", { count: items.length })}</dd></div><div><dt>{t("expenses.expenseTotal")}</dt><dd>{money(total("gross_amount"))}</dd></div>{reimbursement ? <div><dt>{t(claim ? "expenses.requestedTotal" : "expenses.staffRequestedTotal")}</dt><dd>{money(total("reimbursement_requested"))}</dd></div> : null}</dl>
    </section>
    <div className={css.requestItems}>{items.map((item, index) => <article key={item.id} className={css.requestItem} data-request-item={item.id}>
     <div><strong>{t("expenses.itemNumber", { count: index + 1 })}</strong><p>{date(String(item.input.expense_date))} · {expenseCategoryLabel(String(item.input.category), locale)}</p><p>{String(item.input.description)}</p></div>
     <div className={css.itemAmount}><strong>{money(Number(item.input.gross_amount))}</strong>{hasReimbursement(claim, [item.input]) ? <small>{t("expenses.requested")}: {money(Number(item.input.reimbursement_requested || 0))}</small> : null}</div>
     <div className={css.actions}>{["editItem", "copyItem", "removeItem"].map((action, n) => { const Icon = [Pencil, Copy, Trash2][n]; return <button type="button" key={action} className={ui.secondary} title={t(`expenses.${action}`)} aria-label={t(`expenses.${action}`)} disabled={blocked || !!editing || (n === 1 && items.length >= 100)} onClick={() => {
      if (n === 0) setEditing(item.id);
      if (n === 1) { const copy = { ...item, id: crypto.randomUUID(), version: null, input: { ...item.input } }; setItems(old => [...old, copy]); setDirty(true); }
      if (n === 2) { setItems(old => old.filter(x => x.id !== item.id)); setDirty(true); }
     }}><Icon size={16} /></button>; })}</div>
    </article>)}</div>
    <button type="button" className={`${ui.secondary} ${css.addRequestItem}`} disabled={blocked || !!editing || items.length >= 100} onClick={() => setEditing(crypto.randomUUID())}><Plus size={17} />{t("expenses.addItem")}</button>
    {editing ? <section className={`${css.itemEditor} ${claim ? "" : company.createEditor}`} aria-label={t("expenses.editItem")}>
     <ExpenseFactsForm key={editing} itemNumber={edited ? items.indexOf(edited) + 1 : items.length + 1} row={edited ? editorRow(edited, claim) : undefined} claim={claim} access={access} accounts={accounts} lookups={lookups} run={run} busy={busy} onDirty={setEditorDirty} onCapture={input => {
      const next = { id: editing, version: edited?.version ?? null, input };
      setItems(old => edited ? old.map(i => i.id === editing ? next : i) : [...old, next]); setEditing(null); setEditorDirty(false); setDirty(true);
     }} />
     <button type="button" className={ui.secondary} disabled={busy} onClick={() => { if (!editorDirty || window.confirm(t("expenses.discardItem"))) { setEditing(null); setEditorDirty(false); } }}>{t("expenses.cancelItem")}</button>
    </section> : null}
    <details className={css.disclosure}><summary>{t("expenses.requestNote")}</summary><FieldGroup id="expense-request-note" label={t("expenses.note")}><textarea maxLength={2000} value={note} disabled={blocked} onChange={e => { setNote(e.target.value); setDirty(true); }} /></FieldGroup></details>
   </div>
  </DetailModal>
  {confirmClose ? <DetailModal open size="edit" title={t("common.state.unsaved")} onClose={() => setConfirmClose(false)} closeOnBackdrop={false} footer={<div className={css.actions}><button type="button" className={ui.secondary} onClick={() => setConfirmClose(false)}>{t(checkpoint ? "expenses.continueRequest" : "expenses.keepEditing")}</button><button type="button" className={ui.secondary} onClick={onClose}>{t(checkpoint ? "common.actions.close" : "expenses.discardCreate")}</button></div>}><p>{t(checkpoint ? "expenses.requestCloseCheckpoint" : "expenses.discardCreateHelp")}</p></DetailModal> : null}
 </>;
}
