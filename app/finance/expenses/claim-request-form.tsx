"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { useI18n } from "../../../lib/i18n/provider";
import { FieldGroup } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { bangkokToday } from "../payouts/review";
import { expenseCategoryChoice, expenseCategoryLabel } from "./categories";
import { claimCategories, claimCategoryOptions } from "./claim-categories";
import { ClaimCategoryCombobox } from "./claim-category-combobox";
import type { Expense, ExpenseLookups } from "./shared";
import css from "./purchase-request.module.css";

export function ClaimRequestForm({ row, lookups, busy, itemNumber, onCapture, onDirty }: { row?: Expense; lookups: ExpenseLookups; busy: boolean; itemNumber: number; onCapture: (input: Record<string, unknown>) => void; onDirty: (dirty: boolean) => void }) {
 const { t, locale } = useI18n();
 const [form, setForm] = useState({ expense_date: row?.expense_date || bangkokToday(), category: row?.category || "", description: row?.description || "", gross_amount: row ? String(row.declared_gross_amount ?? row.gross_amount) : "", vendor_name: row?.vendor_name || "" });
 const [related, setRelated] = useState(!!(row?.client_id || row?.case_id || row?.advisory_matter_id));
 const [context, setContext] = useState({ client_id: row?.client_id || "", case_id: row?.case_id ?? null, advisory_matter_id: row?.advisory_matter_id || null });
 const work = context.case_id != null ? `case:${context.case_id}` : context.advisory_matter_id ? `advisory:${context.advisory_matter_id}` : "";
 const selectWork = (value: string) => {
  const selectedCase = lookups.cases.find(c => `case:${c.id}` === value);
  const selectedMatter = lookups.matters.find(m => `advisory:${m.id}` === value);
  setContext(old => ({ client_id: selectedCase ? selectedCase.client_id || "" : selectedMatter ? selectedMatter.client_id || "" : old.client_id, case_id: selectedCase?.id ?? null, advisory_matter_id: selectedMatter?.id ?? null }));
 };
 const [category, setCategory] = useState(() => claimCategories.some(c => c.value === row?.category) ? row!.category : expenseCategoryChoice(row?.category || ""));
 const categoryOptions = claimCategoryOptions(row?.category && expenseCategoryChoice(row.category) !== "Other" ? { value: row.category, label: expenseCategoryLabel(row.category,locale) } : undefined);
 const set = (key: keyof typeof form, value: string) => setForm(old => ({ ...old, [key]: value }));
 return <form className={css.createForm} data-claim-request-form onChange={() => onDirty(true)} onSubmit={e => {
  e.preventDefault();onCapture({ ...form, client_id: related ? context.client_id || null : null, case_id: related ? context.case_id : null, advisory_matter_id: related ? context.advisory_matter_id : null, gross_amount: Number(form.gross_amount), supplier_payee_id: null, personally_paid: true, reimbursement_requested: Number(form.gross_amount), note: row?.note || "",
   vat_awareness: row?.vat_awareness || "unknown", wht_awareness: row?.wht_awareness || "unknown" });
 }}><fieldset disabled={busy}><legend>{t("expenses.itemNumber", { count: itemNumber })}</legend><div className={css.fields}>
  <FieldGroup id="claim-date" label={t("expenses.claimPaidDate")}><input type="date" max={bangkokToday()} required value={form.expense_date} onChange={e => set("expense_date",e.target.value)} /></FieldGroup>
  <FieldGroup id="claim-category" label={t("expenses.category")}><ClaimCategoryCombobox value={category} options={categoryOptions} disabled={busy} onChange={value => { if (value === category) return;setCategory(value);set("category",value === "Other" ? "" : value);onDirty(true); }} /></FieldGroup>
  {category === "Other" ? <FieldGroup id="claim-custom-category" label={t("expenses.claimCustomCategory")}><input required pattern={".*\\S.*"} maxLength={150} value={form.category} onChange={e => set("category",e.target.value)} /></FieldGroup> : null}
  <FieldGroup id="claim-vendor" label={t("expenses.claimVendor")}><input maxLength={300} value={form.vendor_name} onChange={e => set("vendor_name",e.target.value)} /></FieldGroup>
  <FieldGroup id="claim-amount" label={t("expenses.claimPersonalAmount")}><input type="number" required min="0.01" step="0.01" value={form.gross_amount} onChange={e => set("gross_amount",e.target.value)} /></FieldGroup>
  <FieldGroup id="claim-description" className={css.full} label={t("expenses.description")}><input required maxLength={2000} value={form.description} onChange={e => set("description",e.target.value)} /></FieldGroup>
 </div>
 <div className={css.linkage}>
  <label className={css.relatedToggle}><input type="checkbox" checked={related} aria-controls="claim-context" aria-expanded={related} onChange={e => { setRelated(e.target.checked); if (!e.target.checked) setContext({ client_id: "", case_id: null, advisory_matter_id: null }); }} />{t("expenses.purchaseRelatedWork")}</label>
  {related ? <div id="claim-context" className={css.fields}>
   <FieldGroup id="claim-client" label={t("expenses.client")}><select value={context.client_id} onChange={e => setContext({ client_id: e.target.value, case_id: null, advisory_matter_id: null })}><option value="">{t("expenses.optional")}</option>{lookups.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FieldGroup>
   <FieldGroup id="claim-work" label={t("expenses.purchaseWork")}><select value={work} onChange={e => selectWork(e.target.value)}><option value="">{t("expenses.optional")}</option><optgroup label={t("expenses.case")}>{lookups.cases.filter(c => c.client_id && (!context.client_id || c.client_id === context.client_id)).map(c => <option key={c.id} value={`case:${c.id}`}>{c.file_no} {c.title}</option>)}</optgroup><optgroup label={t("expenses.matter")}>{lookups.matters.filter(m => m.client_id && (!context.client_id || m.client_id === context.client_id)).map(m => <option key={m.id} value={`advisory:${m.id}`}>{m.matter_no} {m.title}</option>)}</optgroup></select></FieldGroup>
  </div> : null}
 </div><div className={css.actions}><button type="submit" className={ui.secondary}><Check size={17} />{t(row ? "expenses.saveItemChanges" : "expenses.addThisItem")}</button></div></fieldset></form>;
}
