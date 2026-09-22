"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { useI18n } from "../../../lib/i18n/provider";
import { FieldGroup } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { bangkokToday } from "../payouts/review";
import { expenseCategoryChoice, expenseCategoryLabel } from "./categories";
import { companyCategories, companyCategoryGroups } from "./company-categories";
import { ClaimCategoryCombobox } from "./claim-category-combobox";
import type { Expense, ExpenseLookups } from "./shared";
import { PurchaseTaxChoices, emptyPurchaseTax } from "./purchase-tax-choices";
import css from "./purchase-request.module.css";

export function PurchaseRequestForm({ row, lookups, busy, itemNumber, onCapture, onDirty }: { row?: Expense; lookups: ExpenseLookups; busy: boolean; itemNumber: number; onCapture: (input: Record<string, unknown>) => void; onDirty: (dirty: boolean) => void }) {
 const { t } = useI18n();
 const [form, setForm] = useState({ expense_date: row?.expense_date || bangkokToday(), category: row?.category || "", description: row?.description || "", gross_amount: row ? String(row.declared_gross_amount ?? row.gross_amount) : "", vendor_name: row?.vendor_name || "" });
 const [related, setRelated] = useState(!!(row?.client_id || row?.case_id || row?.advisory_matter_id));
 const [context, setContext] = useState({ client_id: row?.client_id || "", case_id: row?.case_id ?? null, advisory_matter_id: row?.advisory_matter_id || null });
 const work = context.case_id != null ? `case:${context.case_id}` : context.advisory_matter_id ? `advisory:${context.advisory_matter_id}` : "";
 const selectWork = (value: string) => {
  const selectedCase = lookups.cases.find(c => `case:${c.id}` === value);
  const selectedMatter = lookups.matters.find(m => `advisory:${m.id}` === value);
  setContext(old => ({ client_id: selectedCase ? selectedCase.client_id || "" : selectedMatter ? selectedMatter.client_id || "" : old.client_id, case_id: selectedCase?.id ?? null, advisory_matter_id: selectedMatter?.id ?? null }));
 };
 const [category, setCategory] = useState(() => expenseCategoryChoice(row?.category || ""));
 const categoryOptions = companyCategoryGroups.flatMap(group => group.items.map(item => ({ ...item, group: group.label })));
 if (row?.category && category !== "Other" && !companyCategories.some(c => c.value === row.category)) categoryOptions.splice(-1, 0, { value: row.category, label: { th: expenseCategoryLabel(row.category, "th"), en: expenseCategoryLabel(row.category, "en") }, group: { th: "หมวดเดิม", en: "Saved category" } });
 const [tax, setTax] = useState(row?.creator_tax || emptyPurchaseTax);
 const set = (key: keyof typeof form, value: string) => setForm(old => ({ ...old, [key]: value }));
 return <form className={css.createForm} data-purchase-request-form onChange={() => onDirty(true)} onSubmit={e => {
  e.preventDefault();onCapture({ ...form, client_id: related ? context.client_id || null : null, case_id: related ? context.case_id : null, advisory_matter_id: related ? context.advisory_matter_id : null, gross_amount: Number(form.gross_amount), supplier_payee_id: null, company_request_version: 1, creator_tax: tax,
   creator_payment_fact: "unpaid", personally_paid: false, claimant_id: null, reimbursement_requested: 0,
   vat_awareness: tax.vat_mode === "none" ? "no" : "yes", wht_awareness: tax.wht_state === "none" ? "no" : "yes" });
 }}><fieldset disabled={busy}><legend>{t("expenses.itemNumber", { count: itemNumber })}</legend><div className={css.fields}>
  <FieldGroup id="purchase-date" label={t("expenses.purchaseRequestDate")}><input type="date" required value={form.expense_date} onChange={e => set("expense_date",e.target.value)} /></FieldGroup>
  <FieldGroup id="purchase-category" label={t("expenses.category")}><ClaimCategoryCombobox id="purchase-category" value={category} options={categoryOptions} disabled={busy} onChange={value => { onDirty(true);setCategory(value);if (value !== category) set("category",value === "Other" ? "" : value); }} /></FieldGroup>
  {category === "Other" ? <FieldGroup id="purchase-custom-category" label={t("finance.legacy.fields.customCategory")}><input required maxLength={150} value={form.category} onChange={e => set("category",e.target.value)} /></FieldGroup> : null}
  <FieldGroup id="purchase-vendor" label={t("expenses.purchaseRequestVendor")}><input required maxLength={300} value={form.vendor_name} onChange={e => set("vendor_name",e.target.value)} /></FieldGroup>
  <FieldGroup id="purchase-amount" label={t("expenses.amount")}><input type="number" required min="0.01" step="0.01" value={form.gross_amount} onChange={e => set("gross_amount",e.target.value)} /></FieldGroup>
  <FieldGroup id="purchase-description" className={css.full} label={t("expenses.description")}><input required maxLength={2000} value={form.description} onChange={e => set("description",e.target.value)} /></FieldGroup>
 </div>
 <div className={css.linkage}>
  <label className={css.relatedToggle}><input type="checkbox" checked={related} aria-controls="purchase-context" aria-expanded={related} onChange={e => { setRelated(e.target.checked); if (!e.target.checked) setContext({ client_id: "", case_id: null, advisory_matter_id: null }); }} />{t("expenses.purchaseRelatedWork")}</label>
  {related ? <div id="purchase-context" className={css.fields}>
   <FieldGroup id="purchase-client" label={t("expenses.client")}><select value={context.client_id} onChange={e => setContext({ client_id: e.target.value, case_id: null, advisory_matter_id: null })}><option value="">{t("expenses.optional")}</option>{lookups.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FieldGroup>
   <FieldGroup id="purchase-work" label={t("expenses.purchaseWork")}><select value={work} onChange={e => selectWork(e.target.value)}><option value="">{t("expenses.optional")}</option><optgroup label={t("expenses.case")}>{lookups.cases.filter(c => c.client_id && (!context.client_id || c.client_id === context.client_id)).map(c => <option key={c.id} value={`case:${c.id}`}>{c.file_no} {c.title}</option>)}</optgroup><optgroup label={t("expenses.matter")}>{lookups.matters.filter(m => m.client_id && (!context.client_id || m.client_id === context.client_id)).map(m => <option key={m.id} value={`advisory:${m.id}`}>{m.matter_no} {m.title}</option>)}</optgroup></select></FieldGroup>
  </div> : null}
 </div><PurchaseTaxChoices value={tax} onChange={setTax} disabled={busy} /><div className={css.actions}><button type="submit" className={ui.secondary}><Check size={17} />{t(row ? "expenses.saveItemChanges" : "expenses.addThisItem")}</button></div></fieldset></form>;
}
