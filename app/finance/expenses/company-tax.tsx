"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { Callout, FieldGroup } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import type { ExpenseRun } from "./forms";
import type { Expense } from "./shared";
import css from "./expenses.module.css";
import company from "./company.module.css";

export type CompanyTaxCalculation = { schema_version: 2; declared_amount: number; vat_base: number | null; vat_rate: number | null; vat_amount: number | null; gross: number | null; wht_base: number | null; wht_rate: number; wht_amount: number | null; net: number | null; ready: boolean; missing: string[] };
export function CompanyTaxSummary({ value }: { value: CompanyTaxCalculation | null }) {
 const { t, locale } = useI18n();
 const money = (n: number | null | undefined) => n == null ? t("expenses.companyTaxCalculating") : `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
 return <dl className={company.taxSummary} aria-live="polite" data-tax-summary>{([['companyBeforeVat',value?.vat_base],['vat',value?.vat_amount],['expenseTotal',value?.gross],['whtBase',value?.wht_base],['wht',value?.wht_amount],['cashNet',value?.net]] as const).map(([label,amount]) => <div key={label}><dt>{t(`expenses.${label}`)}</dt><dd>{money(amount)}</dd></div>)}</dl>;
}
export function CompanyTaxForm({ row, reason, busy, run, onPlan, onCalculation, planning }: { row: Expense; reason: string; busy: boolean; run: ExpenseRun; planning: boolean; onPlan: (args: Record<string, unknown> | null) => void; onCalculation: (value: CompanyTaxCalculation | null) => void }) {
 const { t } = useI18n(), [id] = useState(() => crypto.randomUUID());
 const saved = row.tax_review?.request_json?.raw_input;
 const [form, setForm] = useState({ vat_mode: String(saved?.vat_mode || (row.tax_review?.vat_state === "none" ? "none" : "")), vat_rate: String(saved?.vat_rate ?? 7), eligibility: row.tax_review?.eligibility || "pending", supplier_tax_id: row.tax_review?.supplier_tax_id || "", tax_document_reference: row.tax_review?.tax_document_reference || "", tax_document_date: row.tax_review?.tax_document_date || "", company_name_status: row.tax_review?.company_name_status || "unknown", wht_state: row.tax_review?.wht_state === "pending" ? "" : row.tax_review?.wht_state || "", wht_rate: String(saved?.wht_rate ?? 3), paid_withholding_ack: false });
 const [note, setNote] = useState(""), [result, setResult] = useState<{ key: string; value: CompanyTaxCalculation } | null>(null), [failed, setFailed] = useState(false);
 const input = useMemo(() => ({ ...form, schema_version: 2, vat_rate: Number(form.vat_rate), wht_rate: Number(form.wht_rate), reason: planning ? reason : note }), [form, planning, reason, note]);
 const key = JSON.stringify(input), calculation = result?.key === key ? result.value : null;
 // The preview and saving RPC share one PostgreSQL calculation. Never compute money in React.
 useEffect(() => {
  let active = true;
  const timer = setTimeout(async () => {
   try {
    const { data, error } = await supabase.rpc("preview_finance_company_expense_tax", { p_expense: row.id, p_input: input });
    if (!active) return;
    if (error || !data || data.schema_version !== 2) { setFailed(true); return; }
    setFailed(false); setResult({ key: JSON.stringify(input), value: data as CompanyTaxCalculation });
   } catch { if (active) setFailed(true); }
  }, 160);
  return () => { active = false; clearTimeout(timer); };
 }, [row.id, input]);
 const args = useMemo(() => ({ p_id: id, p_expense: row.id, p_previous: row.tax_review?.id || null, p_input: input }), [id, row.id, row.tax_review?.id, input]);
 useEffect(() => { onCalculation(calculation); onPlan(calculation?.ready ? args : null); }, [calculation, args, onPlan, onCalculation]);
 const set = (field: keyof typeof form, value: string | boolean) => setForm(old => ({ ...old, [field]: value }));
 const select = (field: keyof typeof form, label: string, choices: [string, string][]) => <FieldGroup id={`company-tax-${field}`} label={t(`expenses.${label}`)}><select value={String(form[field])} onChange={e => set(field, e.target.value)}>{choices.map(([value, label]) => <option key={value} value={value}>{t(`expenses.${label}`)}</option>)}</select></FieldGroup>;
 return <form className={`${css.form} ${company.taxReview}`} data-review-plan="tax" onSubmit={e => { e.preventDefault(); if (!planning && calculation?.ready) void run("review_finance_expense_tax", args); }}>
  <fieldset disabled={busy}><legend>{t("expenses.companyTaxDecision")}</legend><div className={css.formGrid}>
   {select("vat_mode", "vat", [["", "choose"], ["none", "companyVatNone"], ["inclusive", "companyVatInclusive"], ["exclusive", "companyVatExclusive"]])}
   {form.vat_mode && form.vat_mode !== "none" ? <>{select("vat_rate", "vatRate", [["7", "companyRate7"], ["0", "companyRate0"]])}{select("eligibility", "eligibility", [["pending", "pending"], ["eligible", "eligible"], ["ineligible", "ineligible"]])}</> : form.vat_mode === "none" ? <p>{t("expenses.eligibility")}: {t("expenses.companyNotApplicable")}</p> : null}
   {form.vat_mode && form.vat_mode !== "none" && form.eligibility === "eligible" ? <>
    {([['supplier_tax_id','supplierTaxId','text'],['tax_document_reference','taxReference','text'],['tax_document_date','taxDate','date']] as const).map(([field,label,type]) => <FieldGroup key={field} id={`company-tax-${field}`} label={t(`expenses.${label}`)}><input type={type} required value={String(form[field])} maxLength={field === "supplier_tax_id" ? 13 : 200} onChange={e => set(field,e.target.value)} /></FieldGroup>)}
    {select("company_name_status", "companyName", [["unknown", "unknown"], ["yes", "yes"], ["no", "no"]])}
   </> : null}
   {select("wht_state", "wht", [["", "choose"], ["none", "companyWhtNone"], ["withhold", "companyWhtWithhold"]])}
   {form.wht_state === "withhold" ? select("wht_rate", "whtRate", [["1", "companyRate1"], ["3", "companyRate3"], ["5", "companyRate5"]]) : null}
   {form.wht_state === "withhold" && row.creator_payment_fact === "company_paid" ? <label className={css.check}><input type="checkbox" checked={form.paid_withholding_ack} onChange={e => set("paid_withholding_ack",e.target.checked)} /><span>{t("expenses.companyPaidWhtAck")}</span></label> : null}
   {!planning ? <FieldGroup id="company-tax-note" label={t(row.tax_review ? "expenses.reason" : "expenses.companyOptionalNote")}><input value={note} maxLength={2000} onChange={e => setNote(e.target.value)} /></FieldGroup> : null}
  </div></fieldset>
  {failed ? <Callout tone="negative">{t("expenses.companyTaxPreviewFailed")}</Callout> : null}
  <CompanyTaxSummary value={calculation} />
  <small>{t("expenses.companyMetadataHelp")}</small>
  {!planning ? <><ul>{calculation?.missing.map(key => <li key={key}>{t(`expenses.${key}`)}</li>)}</ul><button className={ui.secondary} disabled={busy || !calculation?.ready || failed} type="submit">{t("expenses.companySaveTax")}</button></> : null}
 </form>;
}
