"use client";
import { useRef, useState } from "react";
import { Copy, Pencil, Plus, Save, Trash2 } from "lucide-react";
import DetailModal from "../../components/DetailModal";
import { Callout, FieldGroup } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { ExpenseFactsForm, type ExpenseRun } from "./forms";
import { expenseCategoryLabel } from "./categories";
import type { Expense, ExpenseAccess, ExpenseAccount, ExpenseLookups } from "./shared";
import type { ExpenseRequest, RequestItemInput } from "./requests";
import css from "./expenses.module.css";

type Props = { request?: ExpenseRequest; claim: boolean; access: ExpenseAccess; accounts: ExpenseAccount[]; lookups: ExpenseLookups; run: ExpenseRun; busy: boolean; error: string; onClose: () => void; onSaved: (id: string) => void };
export function requestItemFromExpense(row: Expense): RequestItemInput {
 const keys = ["expense_date", "category", "description", "gross_amount", "vendor_name", "supplier_payee_id", "claimant_id", "client_id", "case_id", "advisory_matter_id", "note", "personally_paid", "reimbursement_requested", "vat_awareness", "wht_awareness"] as const;
 return { id: row.id, version: row.version, input: { ...Object.fromEntries(keys.map(k => [k, row[k]])), ...row.request_entry_account } };
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
 const operation = useRef<{ payload: string; id: string } | null>(null);
 const edited = items.find(i => i.id === editing);
 const money = (v: number) => `${v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
 const total = (key: string) => items.reduce((n, item) => n + Math.round(Number(item.input[key] || 0) * 100), 0) / 100;
 const close = () => { if (busy) return; if (dirty || editorDirty) setConfirmClose(true); else onClose(); };
 async function save() {
  if (busy || editing || !items.length) return;
  const args = { p_id: id, p_version: request?.version ?? null, p_kind: claim ? "employee_claim" : "company_expense_batch", p_note: note, p_items: items };
  const payload = JSON.stringify(args);
  if (operation.current?.payload !== payload) operation.current = { payload, id: crypto.randomUUID() };
  const saved = await run("save_finance_expense_request", { ...args, p_operation: operation.current.id });
  if (saved) onSaved(saved);
 }
 return <>
  <DetailModal open size="workflow" title={t(claim ? "expenses.newClaimRequest" : "expenses.newBatch")} onClose={close} closeOnBackdrop={false}
   footer={<div className={css.createFooter}><button type="button" className={ui.secondary} disabled={busy} onClick={close}>{t("common.actions.close")}</button><button type="button" className={ui.primary} disabled={busy || !!editing || !items.length} onClick={() => void save()}><Save size={17} />{t("expenses.saveRequest")}</button></div>}>
   <div className={css.page}>
    {error ? <Callout tone="negative" role="alert">{t(`expenses.${error}`)}</Callout> : null}
    <section className={css.requestSummary} aria-label={t("expenses.requestSummary")}>
     <h2>{t("expenses.requestItems")}</h2>
     <dl className={css.requestTotals} aria-live="polite"><div><dt>{t("expenses.itemCount")}</dt><dd>{t("expenses.count", { count: items.length })}</dd></div><div><dt>{t("expenses.expenseTotal")}</dt><dd>{money(total("gross_amount"))}</dd></div><div><dt>{t("expenses.requestedTotal")}</dt><dd>{money(total("reimbursement_requested"))}</dd></div></dl>
    </section>
    <div className={css.requestItems}>{items.map((item, index) => <article key={item.id} className={css.requestItem} data-request-item={item.id}>
     <div><strong>{t("expenses.itemNumber", { count: index + 1 })}</strong><p>{date(String(item.input.expense_date))} · {expenseCategoryLabel(String(item.input.category), locale)}</p><p>{String(item.input.description)}</p></div>
     <div className={css.itemAmount}><strong>{money(Number(item.input.gross_amount))}</strong><small>{t("expenses.requested")}: {money(Number(item.input.reimbursement_requested || 0))}</small></div>
     <div className={css.actions}>{["editItem", "copyItem", "removeItem"].map((action, n) => { const Icon = [Pencil, Copy, Trash2][n]; return <button type="button" key={action} className={ui.secondary} title={t(`expenses.${action}`)} aria-label={t(`expenses.${action}`)} disabled={busy || !!editing || (n === 1 && items.length >= 100)} onClick={() => {
      if (n === 0) setEditing(item.id);
      if (n === 1) { const copy = { ...item, id: crypto.randomUUID(), version: null, input: { ...item.input } }; setItems(old => [...old, copy]); setDirty(true); }
      if (n === 2) { setItems(old => old.filter(x => x.id !== item.id)); setDirty(true); }
     }}><Icon size={16} /></button>; })}</div>
    </article>)}</div>
    <button type="button" className={`${ui.secondary} ${css.addRequestItem}`} disabled={busy || !!editing || items.length >= 100} onClick={() => setEditing(crypto.randomUUID())}><Plus size={17} />{t("expenses.addItem")}</button>
    {editing ? <section className={css.itemEditor} aria-label={t("expenses.editItem")}>
     <ExpenseFactsForm key={editing} itemNumber={edited ? items.indexOf(edited) + 1 : items.length + 1} row={edited ? editorRow(edited, claim) : undefined} claim={claim} access={access} accounts={accounts} lookups={lookups} run={run} busy={busy} onDirty={setEditorDirty} onCapture={input => {
      const next = { id: editing, version: edited?.version ?? null, input };
      setItems(old => edited ? old.map(i => i.id === editing ? next : i) : [...old, next]); setEditing(null); setEditorDirty(false); setDirty(true);
     }} />
     <button type="button" className={ui.secondary} disabled={busy} onClick={() => { if (!editorDirty || window.confirm(t("expenses.discardItem"))) { setEditing(null); setEditorDirty(false); } }}>{t("expenses.cancelItem")}</button>
    </section> : null}
    <details className={css.disclosure}><summary>{t("expenses.requestNote")}</summary><FieldGroup id="expense-request-note" label={t("expenses.note")}><textarea maxLength={2000} value={note} disabled={busy} onChange={e => { setNote(e.target.value); setDirty(true); }} /></FieldGroup></details>
   </div>
  </DetailModal>
  {confirmClose ? <DetailModal open size="edit" title={t("common.state.unsaved")} onClose={() => setConfirmClose(false)} closeOnBackdrop={false} footer={<div className={css.actions}><button type="button" className={ui.secondary} onClick={() => setConfirmClose(false)}>{t("expenses.keepEditing")}</button><button type="button" className={ui.secondary} onClick={onClose}>{t("expenses.discardCreate")}</button></div>}><p>{t("expenses.discardCreateHelp")}</p></DetailModal> : null}
 </>;
}
