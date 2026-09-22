"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { useI18n } from "../../../lib/i18n/provider";
import { FieldGroup } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { bangkokToday } from "../payouts/review";
import { expenseCategoryChoice, expenseCategoryLabel } from "./categories";
import { companyCategories, companyCategoryGroups } from "./company-categories";
import type { Expense, ExpenseLookups } from "./shared";
import { PurchaseTaxChoices, emptyPurchaseTax } from "./purchase-tax-choices";
import css from "./purchase-request.module.css";

export function PurchaseRequestForm({ row, busy, itemNumber, onCapture, onDirty }: { row?: Expense; lookups: ExpenseLookups; busy: boolean; itemNumber: number; onCapture: (input: Record<string, unknown>) => void; onDirty: (dirty: boolean) => void }) {
 const { t, locale } = useI18n();
 const [form, setForm] = useState({ expense_date: row?.expense_date || bangkokToday(), category: row?.category || "", description: row?.description || "", gross_amount: row ? String(row.declared_gross_amount ?? row.gross_amount) : "", vendor_name: row?.vendor_name || "" });
 const [category, setCategory] = useState(() => expenseCategoryChoice(row?.category || ""));
 const [tax, setTax] = useState(row?.creator_tax || emptyPurchaseTax);
 const set = (key: keyof typeof form, value: string) => setForm(old => ({ ...old, [key]: value }));
 return <form className={css.createForm} data-purchase-request-form onChange={() => onDirty(true)} onSubmit={e => {
  e.preventDefault();onCapture({ ...form, gross_amount: Number(form.gross_amount), supplier_payee_id: null, company_request_version: 1, creator_tax: tax,
   creator_payment_fact: "unpaid", personally_paid: false, claimant_id: null, reimbursement_requested: 0,
   vat_awareness: tax.vat_mode === "none" ? "no" : "yes", wht_awareness: tax.wht_state === "none" ? "no" : "yes" });
 }}><fieldset disabled={busy}><legend>{t("expenses.itemNumber", { count: itemNumber })}</legend><div className={css.fields}>
  <FieldGroup id="purchase-date" label={t("expenses.purchaseRequestDate")}><input type="date" required value={form.expense_date} onChange={e => set("expense_date",e.target.value)} /></FieldGroup>
  <FieldGroup id="purchase-category" label={t("expenses.category")}><select required value={category} onChange={e => { setCategory(e.target.value);set("category",e.target.value === "Other" ? "" : e.target.value); }}><option value="">{t("expenses.choose")}</option>{companyCategoryGroups.map(group => <optgroup key={group.label.en} label={group.label[locale]}>{group.items.map(c => <option key={c.value} value={c.value}>{c.label[locale]}</option>)}</optgroup>)}{row?.category && category !== "Other" && !companyCategories.some(c => c.value === row.category) ? <option value={row.category}>{expenseCategoryLabel(row.category,locale)}</option> : null}</select></FieldGroup>
  {category === "Other" ? <FieldGroup id="purchase-custom-category" label={t("finance.legacy.fields.customCategory")}><input required maxLength={150} value={form.category} onChange={e => set("category",e.target.value)} /></FieldGroup> : null}
  <FieldGroup id="purchase-vendor" label={t("expenses.purchaseRequestVendor")}><input required maxLength={300} value={form.vendor_name} onChange={e => set("vendor_name",e.target.value)} /></FieldGroup>
  <FieldGroup id="purchase-amount" label={t("expenses.amount")}><input type="number" required min="0.01" step="0.01" value={form.gross_amount} onChange={e => set("gross_amount",e.target.value)} /></FieldGroup>
  <FieldGroup id="purchase-description" className={css.full} label={t("expenses.description")}><input required maxLength={2000} value={form.description} onChange={e => set("description",e.target.value)} /></FieldGroup>
 </div><PurchaseTaxChoices value={tax} onChange={setTax} disabled={busy} /><div className={css.actions}><button type="submit" className={ui.secondary}><Check size={17} />{t(row ? "expenses.saveItemChanges" : "expenses.addThisItem")}</button></div></fieldset></form>;
}
