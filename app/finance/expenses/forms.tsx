"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Plus, Save, Send, Wallet } from "lucide-react";
import { Callout, FieldGroup } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { bangkokToday } from "../payouts/review";
import { type Expense, type ExpenseAccess, type ExpenseAccount, type ExpenseLookups, type SettlementMode, expenseHref } from "./shared";
import { expenseCategoryOptions, expenseCategoryLabel, expenseCategoryChoice } from "./categories";
import { companyCategories, companyCategoryGroups } from "./company-categories";
import { companyPayee } from "./company-workflow";
import { companyHistoricalMoney, companyUnpaidFlow, companyMoneyCandidates, companyMoneyModes, recommendedMoneyMode, supplierCandidates } from "./company-money";
import { CompanyPayeeSetup } from "./company-payee";
import { expenseAccountBlocked, expenseAccountIssue } from "./presentation";
import css from "./expenses.module.css";
import moneyCss from "./company-money.module.css";

export type ExpenseRun = (rpc: string, args: Record<string, unknown>) => Promise<string | null>;
export function ExpenseFactsForm({ row, claim, access, accounts, lookups, run, busy, onDirty, onSaved, actionContainer, onCapture, itemNumber }: { row?: Expense; claim: boolean; access: ExpenseAccess; accounts: ExpenseAccount[]; lookups: ExpenseLookups; run: ExpenseRun; busy: boolean; onDirty?: (dirty: boolean) => void; onSaved?: (id: string) => void; actionContainer?: HTMLElement | null; onCapture?: (input: Record<string, unknown>) => void; itemNumber?: number }) {
 const { t, locale } = useI18n(), router = useRouter();
 const companyCapture = !claim && !!onCapture;
 const paymentFacts = companyCapture && access.creator_payment_fact_supported === true;
 const declarationOnly = paymentFacts && access.company_declaration_without_account_supported === true;
 const twoFlows = declarationOnly && !companyHistoricalMoney(row);
 const formId = useId();
 const [id] = useState(() => row?.id || crypto.randomUUID());
 const [handling, setHandling] = useState(twoFlows ? ["company_paid", "unpaid"].includes(row?.creator_payment_fact || "") ? row!.creator_payment_fact! : "" : paymentFacts && row?.creator_payment_fact ? row.creator_payment_fact === "personal_paid" ? "personal" : row.creator_payment_fact : !onCapture && !claim && !access.can_manage ? "company_paid" : row?.personally_paid ? "personal" : !companyCapture && row?.supplier_payee_id ? "unpaid" : "unknown");
 const immediate = !onCapture && !claim && handling === "company_paid";
 const [categoryChoice, setCategoryChoice] = useState(() => expenseCategoryChoice(row?.category || ""));
 const [customCategory, setCustomCategory] = useState(() => expenseCategoryChoice(row?.category || "") === "Other" ? row?.category || "" : "");
 const categories = expenseCategoryOptions(claim ? "claim" : "company", row?.category);
 const [related, setRelated] = useState(!!(row?.client_id || row?.case_id || row?.advisory_matter_id));
 const [reducedRequest, setReducedRequest] = useState(!!row && row.reimbursement_requested < row.gross_amount);
 const [account, setAccount] = useState(row?.request_entry_account?.bank_account_id || row?.request_entry_account?.cash_location_id || ""), [paidOn, setPaidOn] = useState(bangkokToday), [ack, setAck] = useState(false);
 const [form, setForm] = useState({ expense_date: row?.expense_date || bangkokToday(), category: row?.category || "", description: row?.description || "", gross_amount: row ? String(row.gross_amount) : "", vendor_name: row?.vendor_name || "", supplier_payee_id: row?.supplier_payee_id || "", claimant_id: twoFlows ? "" : row?.claimant_id || "", client_id: row?.client_id || "", case_id: row?.case_id ? String(row.case_id) : "", advisory_matter_id: row?.advisory_matter_id || "", note: row?.note || "", personally_paid: twoFlows ? false : row?.personally_paid ?? claim, reimbursement_requested: twoFlows ? "" : row ? String(row.reimbursement_requested) : "", vat_awareness: row?.vat_awareness || "unknown", wht_awareness: row?.wht_awareness || "unknown" });
 const set = (key: keyof typeof form, value: string | boolean) => setForm(old => {
  if (key === "client_id") return { ...old, client_id: String(value), case_id: "", advisory_matter_id: "" };
  if (key === "case_id") return { ...old, case_id: String(value), advisory_matter_id: "", client_id: lookups.cases.find(c => String(c.id) === value)?.client_id || old.client_id };
  if (key === "advisory_matter_id") return { ...old, advisory_matter_id: String(value), case_id: "", client_id: lookups.matters.find(m => m.id === value)?.client_id || old.client_id };
  if (key === "gross_amount" && claim && !reducedRequest) return { ...old, gross_amount: String(value), reimbursement_requested: String(value) };
  return { ...old, [key]: value };
 });
 const field = (key: keyof typeof form, label: string, type = "text", required = false) => <FieldGroup id={`expense-${key}`} label={t(`expenses.${label}`)}><input type={type} required={required} max={type === "date" ? bangkokToday() : undefined} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.01" : undefined} maxLength={key === "description" ? 2000 : 300} value={String(form[key])} onChange={e => set(key, e.target.value)} /></FieldGroup>;
 const select = (key: keyof typeof form, label: string, options: { id: string | number; name: string }[], required = false) => <FieldGroup id={`expense-${key}`} label={t(`expenses.${label}`)}><select required={required} value={String(form[key])} onChange={e => set(key, e.target.value)}><option value="">{t(required ? "expenses.choose" : "expenses.optional")}</option>{options.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FieldGroup>;
 function changeHandling(value: string) {
  setHandling(value); setAck(false); setAccount("");
  setForm(old => ({ ...old, personally_paid: value === "personal", claimant_id: value === "personal" ? old.claimant_id : "", reimbursement_requested: value === "personal" ? old.reimbursement_requested : "" }));
 }
 async function save(event: React.FormEvent) {
  event.preventDefault(); if (busy) return;
  const a = declarationOnly ? undefined : accounts.find(a => a.id === account);
  const input = { ...form, origin: claim ? "employee_claim" : "company_purchase", currency: "THB", gross_amount: Number(form.gross_amount), reimbursement_requested: form.personally_paid && !immediate ? Number(form.reimbursement_requested) : 0, bank_account_id: a?.bank_account_id || null, cash_location_id: a?.cash_location_id || null };
  if (paymentFacts) Object.assign(input, { creator_payment_fact: handling === "personal" ? "personal_paid" : handling || null });
  if (onCapture) { onCapture(input); onDirty?.(false); return; }
  const result = immediate ? await run("record_finance_paid_expense", { p_id: id, p_input: input, p_bank: a?.bank_account_id || null, p_cash: a?.cash_location_id || null, p_paid_on: paidOn, p_acknowledged: ack }) : await run("save_finance_expense", { p_id: id, p_version: row?.version ?? null, p_input: input });
  if (result) { onDirty?.(false); if (onSaved) onSaved(result); else router.push(expenseHref({ id: result, origin: claim ? "employee_claim" : "company_purchase" })); }
 }
 const actions = <div className={css.footer}><button type="submit" form={formId} className={ui.primary} disabled={busy || (immediate && (!ack || !account))}>{onCapture && !row ? <Plus size={17} aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}{t(busy ? "expenses.working" : onCapture ? row ? "expenses.saveItemChanges" : "expenses.addThisItem" : immediate ? "expenses.paidEntry" : "expenses.save")}</button></div>;
 return <form id={formId} onSubmit={save} onChange={() => onDirty?.(true)} className={css.form}><fieldset disabled={busy} className={css.createFields}><legend>{onCapture && itemNumber ? t("expenses.itemNumber", { count: itemNumber }) : t(claim ? "expenses.newClaim" : "expenses.facts")}</legend><div className={css.formGrid}>
  {field("expense_date", "date", "date", true)}
  <FieldGroup id="expense-category" className={css.categoryField} label={t("expenses.category")} help={categoryChoice && categoryChoice !== "Other" ? expenseCategoryLabel(categoryChoice, locale) : undefined}><select required value={categoryChoice} onChange={e => { setCategoryChoice(e.target.value); set("category", e.target.value === "Other" ? customCategory : e.target.value); }}><option value="">{t("expenses.choose")}</option>{claim ? categories.map(category => <option key={category.value} value={category.value}>{category.label[locale]}</option>) : <>{companyCategoryGroups.map(group => <optgroup key={group.label.en} label={group.label[locale]}>{group.items.map(category => <option key={category.value} value={category.value}>{category.label[locale]}</option>)}</optgroup>)}{row?.category && categoryChoice !== "Other" && !companyCategories.some(c => c.value === row.category) ? <option value={row.category}>{expenseCategoryLabel(row.category, locale)}</option> : null}</>}</select></FieldGroup>
  {categoryChoice === "Other" ? <div className={css.span}><FieldGroup id="expense-custom-category" label={t("finance.legacy.fields.customCategory")}><input required maxLength={150} value={form.category} onChange={e => { setCustomCategory(e.target.value); set("category", e.target.value); }} /></FieldGroup></div> : null}
  {companyCapture ? field("vendor_name", "companyVendor") : null}
  {field("gross_amount", "amount", "number", true)}
  {twoFlows ? <fieldset className={moneyCss.choices}><legend>{t("expenses.companyPaymentStatus")}</legend><div>{["company_paid", "unpaid"].map(value => <label key={value}><input type="radio" name={`${formId}-payment-status`} value={value} checked={handling === value} onChange={() => changeHandling(value)} /><span>{t(value === "company_paid" ? "expenses.handlingCompanyPaid" : "expenses.companyUnpaid")}</span></label>)}</div></fieldset> : !claim ? <FieldGroup id="expense-handling" label={t(companyCapture ? "expenses.companyPaymentQuestion" : "expenses.paymentFacts")}><select value={handling} onChange={e => changeHandling(e.target.value)}>
   {access.can_manage || onCapture ? <option value="unknown">{t(companyCapture ? "expenses.companyPaymentUnknown" : "expenses.handlingUnknown")}</option> : null}
   {(access.can_manage && !companyCapture) || paymentFacts ? <option value="unpaid">{t(companyCapture ? "expenses.companyUnpaid" : "expenses.handlingUnpaid")}</option> : null}
   {paymentFacts ? <option value="company_paid">{t("expenses.handlingCompanyPaid")}</option> : null}
   {access.can_manage || paymentFacts ? <option value="personal" disabled={!access.can_manage}>{t(companyCapture ? "expenses.companyPersonalPaid" : "expenses.handlingPersonal")}</option> : null}
   {!onCapture && !row && accounts.some(a => a.can_record && a.can_confirm) ? <option value="company_paid">{t("expenses.handlingCompanyPaid")}</option> : null}
  </select></FieldGroup> : null}
  <div className={css.span}>{field("description", "description", "text", true)}</div>
 </div>
 {companyCapture ? <p className={css.muted}>{t(paymentFacts ? "expenses.companyDeclarationOnly" : "expenses.companyPaymentGate")}</p> : null}
 {twoFlows ? <p className={css.muted}>{t("expenses.companyPersonalClaimHelp")} <Link href="/finance/expenses/claims">{t("expenses.claims")}</Link></p> : null}
 {onCapture && !claim && !access.can_manage && !declarationOnly ? <AccountSelect accounts={accounts.filter(a => a.can_record)} value={account} onChange={setAccount} disabled={busy} /> : null}
 {!claim && handling === "unpaid" ? <div className={css.formGrid}>{!companyCapture ? field("vendor_name", "vendor") : null}{access.can_manage ? select("supplier_payee_id", "supplierKnown", (companyCapture ? supplierCandidates(lookups) : lookups.payees).map(p => ({ id: p.id, name: p.legal_name }))) : null}</div> : null}
 {!immediate && (claim || form.personally_paid) ? <div className={css.requestFields}>
  {!claim ? select("claimant_id", "claimant", lookups.people, true) : null}
  <FieldGroup id="expense-reimbursement_requested" label={t("expenses.requested")} help={t(claim ? "expenses.claimRequestHelp" : "expenses.draftRequestHelp")}><input type="number" min="0" max={form.gross_amount || undefined} step="0.01" required={claim} readOnly={claim && !reducedRequest} value={claim && !reducedRequest ? form.gross_amount : form.reimbursement_requested} onChange={e => set("reimbursement_requested", e.target.value)} /></FieldGroup>
  {claim ? <label className={css.check}><input type="checkbox" checked={reducedRequest} onChange={e => { setReducedRequest(e.target.checked); if (!e.target.checked) set("reimbursement_requested", form.gross_amount); }} /><span>{t("expenses.requestLess")}</span></label> : <p className={css.muted}>{t("expenses.draftZeroRequest")}</p>}
 </div> : null}
 {immediate && !row ? <div className={css.paymentPanel}>
  <p className={css.muted}>{t("expenses.paidEntryHelp")}</p><div className={css.formGrid}>
   <AccountSelect accounts={accounts.filter(a => a.can_record && a.can_confirm)} value={account} onChange={setAccount} disabled={busy} />
   <FieldGroup id="expense-paid-on" label={t("expenses.paidOn")}><input type="date" value={paidOn} min={form.expense_date} max={bangkokToday()} required disabled={busy} onChange={e => setPaidOn(e.target.value)} /></FieldGroup></div>
   <label className={css.check}><input required type="checkbox" checked={ack} disabled={busy} onChange={e => setAck(e.target.checked)} /><span>{t("expenses.paymentAck")}</span></label>
 </div> : null}
 <div className={css.optionalFields}>
  <label className={css.check}><input type="checkbox" checked={related} aria-controls={`${formId}-context`} aria-expanded={related} onChange={e => { setRelated(e.target.checked); if (!e.target.checked) setForm(old => ({ ...old, client_id: "", case_id: "", advisory_matter_id: "" })); }} /><span>{t("expenses.relatedWork")}</span></label>
  {related ? <div id={`${formId}-context`} className={css.formGrid}>{select("client_id", "client", lookups.clients)}{select("case_id", "case", lookups.cases.filter(x => !form.client_id || x.client_id === form.client_id).map(x => ({ id: x.id, name: `${x.file_no || ""} ${x.title || ""}` })))}{select("advisory_matter_id", "matter", lookups.matters.filter(x => !form.client_id || x.client_id === form.client_id).map(x => ({ id: x.id, name: `${x.matter_no || ""} ${x.title || ""}` })))}</div> : null}
  {!immediate ? <details className={css.disclosure}><summary>{t("expenses.taxIfKnown")}</summary><div className={css.formGrid}>{(["vat_awareness", "wht_awareness"] as const).map(key => <FieldGroup key={key} id={`expense-${key}`} label={t(key === "vat_awareness" ? "expenses.vatAwareness" : "expenses.whtAwareness")}><select value={form[key]} onChange={e => set(key, e.target.value)}>{["unknown", "yes", "no"].map(v => <option key={v} value={v}>{t(`expenses.${v}`)}</option>)}</select></FieldGroup>)}</div></details> : null}
  <details className={css.disclosure} open={row?.note ? true : undefined}><summary>{t("expenses.optionalDetails")}</summary><div className={css.formGrid}>{!claim && handling !== "unpaid" && !companyCapture ? field("vendor_name", "vendor") : null}{companyCapture && access.can_manage && !form.personally_paid && handling !== "unpaid" && handling !== "company_paid" ? select("supplier_payee_id", "supplierKnown", supplierCandidates(lookups).map(p => ({ id: p.id, name: p.legal_name }))) : null}<div className={css.span}><FieldGroup id="expense-note" label={t("expenses.note")}><textarea maxLength={2000} value={form.note} onChange={e => set("note", e.target.value)} /></FieldGroup></div></div></details>
 </div></fieldset>
 {actionContainer ? createPortal(actions, actionContainer) : actions}
 </form>;
}

export function AccountSelect({ accounts, value, onChange, disabled, showReadiness = false }: { accounts: ExpenseAccount[]; value: string; onChange: (value: string) => void; disabled?: boolean; showReadiness?: boolean }) {
 const { t, locale } = useI18n(), a = accounts.find(a => a.id === value);
 const issue = a && showReadiness ? expenseAccountIssue(a) : null;
 const balance = a ? a.can_view_balance ? `${t("expenses.balance")}: ${a.balance == null ? t("expenses.unavailable") : a.balance.toLocaleString(locale, { minimumFractionDigits: 2 }) + " THB"}` : t("expenses.balancePrivate") : "";
 return <FieldGroup id="expense-payment-account" label={t("expenses.account")} help={[issue ? t(`expenses.${issue}`) : "", balance].filter(Boolean).join(" · ")}><select required disabled={disabled} value={value} onChange={e => onChange(e.target.value)}><option value="">{t("expenses.choose")}</option>{accounts.map(a => <option key={a.id} value={a.id} disabled={showReadiness && expenseAccountBlocked(a)}>{a.name}{showReadiness && expenseAccountIssue(a) ? ` · ${t(`expenses.${expenseAccountIssue(a)}`)}` : ""}</option>)}</select></FieldGroup>;
}
type ReviewPlan = { onPlan: (args: Record<string, unknown>) => void; reason: string };
export function ExpenseTaxForm({ row, run, busy, secondary = false, plan, inputVatOnly = false }: { row: Expense; run: ExpenseRun; busy: boolean; secondary?: boolean; plan?: ReviewPlan; inputVatOnly?: boolean }) {
 const { t } = useI18n(), r = row.tax_review;
 const [id] = useState(() => crypto.randomUUID());
 const [form, setForm] = useState({ vat_state: r?.vat_state || (plan && row.vat_awareness === "no" ? "none" : plan && row.vat_awareness === "yes" ? "exists" : "pending"), vat_base: r?.vat_base == null ? "" : String(r.vat_base), vat_rate: r?.vat_rate == null ? "" : String(r.vat_rate), eligibility: r?.eligibility || (plan && row.vat_awareness === "no" ? "ineligible" : "pending"), supplier_tax_id: r?.supplier_tax_id || "", tax_document_reference: r?.tax_document_reference || "", tax_document_date: r?.tax_document_date || row.expense_date, company_name_status: r?.company_name_status || "unknown", wht_state: r?.wht_state || (plan && row.wht_awareness === "no" ? "none" : "pending"), wht_base: r?.wht_base == null ? "" : String(r.wht_base), wht_rate: r?.wht_rate == null ? "" : String(r.wht_rate), reason: "" });
 const set = (key: string, value: string) => setForm(old => ({ ...old, [key]: value }));
 const select = (key: keyof typeof form, label: string, values: string[]) => <FieldGroup id={`tax-${key}`} label={t(`expenses.${label}`)}><select value={form[key]} onChange={e => { set(key, e.target.value); if (key === "vat_state") set("eligibility", e.target.value === "none" ? "ineligible" : "pending"); }}>{values.map(v => <option key={v} value={v}>{t(`expenses.${v}`)}</option>)}</select></FieldGroup>;
 const field = (key: keyof typeof form, label: string, type = "text", required = false) => <FieldGroup id={`tax-${key}`} label={t(`expenses.${label}`)}><input type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.0001" : undefined} required={required} value={form[key]} maxLength={key === "supplier_tax_id" ? 13 : 300} onChange={e => set(key, e.target.value)} /></FieldGroup>;
 const reason = plan?.reason ?? form.reason, onPlan = plan?.onPlan;
 const args = useMemo(() => ({ p_id: id, p_expense: row.id, p_previous: r?.id || null, p_input: { ...form, reason, vat_base: form.vat_base ? Number(form.vat_base) : null, vat_rate: form.vat_rate ? Number(form.vat_rate) : null, wht_base: form.wht_base ? Number(form.wht_base) : null, wht_rate: form.wht_rate ? Number(form.wht_rate) : null } }), [form, id, r?.id, reason, row.id]);
 useEffect(() => { onPlan?.(args); }, [args, onPlan]);
 async function save(event: React.FormEvent) { event.preventDefault(); if (!plan) await run("review_finance_expense_tax", args); }
 return <form className={css.form} data-review-plan={plan ? "tax" : undefined} onSubmit={save}><fieldset disabled={busy}><legend>{t("expenses.taxReview")}</legend><div className={css.formGrid}>
  {select("vat_state", "vat", ["pending", "none", "exists"])}
  {form.vat_state === "exists" ? <>{field("vat_base", "vatBase", "number", true)}{field("vat_rate", "vatRate", "number", true)}{select("eligibility", "eligibility", ["pending", "eligible", "ineligible"])}{select("company_name_status", "companyName", ["unknown", "yes", "no"])}{field("supplier_tax_id", "supplierTaxId", "text", form.eligibility === "eligible")}{field("tax_document_reference", "taxReference", "text", form.eligibility === "eligible")}{field("tax_document_date", "taxDate", "date", form.eligibility === "eligible")}</> : null}
  {!inputVatOnly ? <>{select("wht_state", "wht", ["pending", "none", "withhold"])}{form.wht_state === "withhold" ? <>{field("wht_base", "whtBase", "number", true)}{field("wht_rate", "whtRate", "number", true)}</> : null}</> : null}
  {!plan ? <div className={css.span}><FieldGroup id="tax-reason" label={t("expenses.reason")}><textarea required value={form.reason} maxLength={2000} onChange={e => set("reason", e.target.value)} /></FieldGroup></div> : null}
 </div></fieldset>{!inputVatOnly && row.personally_paid && form.wht_state !== "none" ? <Callout tone="warning">{t("expenses.whtException")}</Callout> : null}
 {!plan ? <div className={css.footer}><button className={secondary ? ui.secondary : ui.primary} type="submit" disabled={busy}><Save size={17} aria-hidden="true" />{t("expenses.saveReview")}</button></div> : null}</form>;
}
export function ExpenseSettlementForm({ row, lookups, run, busy, companyReview = false, optionalNote = false, taxWithholding = false, plan, onPayees }: { row: Expense; lookups: ExpenseLookups; run: ExpenseRun; busy: boolean; companyReview?: boolean; optionalNote?: boolean; taxWithholding?: boolean; plan?: ReviewPlan; onPayees?: (rows: ExpenseLookups["payees"]) => void }) {
 const { t } = useI18n(), [id] = useState(() => crypto.randomUUID());
 const [updatedPayees, setUpdatedPayees] = useState<ExpenseLookups["payees"] | null>(null);
 const parties = updatedPayees ? { ...lookups, payees: updatedPayees } : lookups;
 const knownPayee = companyReview ? companyPayee(row, parties) : null;
 const fixedUnpaid = companyReview && companyUnpaidFlow(row);
 const declaredPaid = companyReview && row.creator_payment_fact === "company_paid" && !row.personally_paid;
 const [mode, setMode] = useState<SettlementMode>(() => companyReview ? recommendedMoneyMode(row) : "undecided"), [amount, setAmount] = useState(String(row.personally_paid ? row.reimbursement_requested : row.gross_amount));
 const [payee, setPayee] = useState(companyReview ? knownPayee?.id || "" : row.personally_paid ? lookups.payees.find(p => p.profile_id === row.claimant_id)?.id || "" : row.supplier_payee_id || ""), [due, setDue] = useState(""), [reason, setReason] = useState("");
 const modes = companyReview ? companyMoneyModes(row) : row.personally_paid ? ["undecided", "reimburse", "no_reimbursement"] : ["undecided", "company_bank", "company_cash", "supplier_unpaid"];
 const candidates = companyReview ? companyMoneyCandidates(row, parties, mode) : lookups.payees.filter(p => mode !== "reimburse" || p.profile_id === row.claimant_id);
 const payable = mode === "reimburse" || mode === "supplier_unpaid";
 const reviewReason = plan?.reason ?? reason, onPlan = plan?.onPlan;
 const withholdingPayee = taxWithholding ? row.supplier_payee_id : null;
 const args = useMemo(() => ({ p_id: id, p_expense: row.id, p_mode: mode, p_payee: companyReview && !payable ? withholdingPayee : payable || mode === "company_bank" || mode === "company_cash" ? payee || null : null, p_amount: mode === "no_reimbursement" ? 0 : mode === "reimburse" ? Number(amount) : row.gross_amount, p_due_on: due || null, p_reason: reviewReason }), [id, row.id, row.gross_amount, mode, payable, payee, amount, due, reviewReason, companyReview, withholdingPayee]);
 useEffect(() => { onPlan?.(args); }, [args, onPlan]);
 return <form className={css.form} data-review-plan={plan ? "settlement" : undefined} onSubmit={async e => { e.preventDefault(); if (!plan) await run("decide_finance_expense_settlement", args); }}>
  <fieldset disabled={busy}><legend>{t(fixedUnpaid ? "expenses.companyUnpaidReview" : declaredPaid ? "expenses.companyPaidChannel" : companyReview ? "expenses.companyMoneyDecision" : "expenses.settlement")}</legend>{companyReview ? <p className={css.muted}>{t(fixedUnpaid ? "expenses.companyUnpaidReviewHelp" : row.creator_payment_fact === "company_paid" ? "expenses.companyPaidReviewHelp" : "expenses.companyMoneyReviewHelp")}</p> : null}<div className={css.formGrid}>
   {!fixedUnpaid ? <FieldGroup id="expense-settlement-mode" label={t(declaredPaid ? "expenses.companyPaidChannel" : companyReview ? "expenses.companyMoneyDecision" : "expenses.payment")}><select value={mode} onChange={e => setMode(e.target.value as SettlementMode)}>{modes.map(v => <option key={v} value={v}>{t(declaredPaid && v === "undecided" ? "expenses.choose" : `expenses.${v}`)}</option>)}</select></FieldGroup> : null}
   {(companyReview ? payable : mode !== "no_reimbursement" && mode !== "undecided") ? <FieldGroup id="settlement-payee" label={t(companyReview ? mode === "reimburse" ? "expenses.companyReimbursementPayee" : "expenses.companySupplierPayee" : "expenses.payee")}>{knownPayee ? <input readOnly value={knownPayee.legal_name} /> : <select required={payable} value={payee} onChange={e => setPayee(e.target.value)}><option value="">{t("expenses.choose")}</option>{candidates.map(p => <option key={p.id} value={p.id}>{p.legal_name}</option>)}</select>}</FieldGroup> : null}
   {mode === "reimburse" ? <FieldGroup id="settlement-amount" label={t("expenses.settlementAmount")}><input type="number" min="0.01" max={row.gross_amount} step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></FieldGroup> : null}
   {payable ? <FieldGroup id="settlement-due" label={t(mode === "supplier_unpaid" ? "expenses.dueOptional" : "expenses.due")}><input type="date" value={due} onChange={e => setDue(e.target.value)} /></FieldGroup> : null}
   {!plan ? <div className={css.span}><FieldGroup id="settlement-reason" label={t(optionalNote ? "expenses.companyOptionalNote" : "expenses.reason")}><textarea required={!optionalNote} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></FieldGroup></div> : null}
  </div></fieldset>{companyReview && payable && !knownPayee && !candidates.some(p => p.id === payee) ? <CompanyPayeeSetup row={row} mode={mode} lookups={parties} disabled={busy} onSaved={(rows, selected) => { setUpdatedPayees(rows); setPayee(selected); onPayees?.(rows); }} /> : null}<Callout tone="info">{t(mode === "no_reimbursement" ? "expenses.noReimbursementHelp" : companyReview && !payable ? "expenses.companyChannelReviewHelp" : "expenses.obligationHelp")}</Callout>
  {!plan ? <div className={css.footer}><button className={companyReview ? ui.secondary : ui.primary} disabled={busy || mode === "undecided"} type="submit"><Check size={17} aria-hidden="true" />{t("expenses.saveSettlement")}</button></div> : null}
 </form>;
}
export function ExpensePaymentPanel({ row, access, accounts, run, busy }: { row: Expense; access: ExpenseAccess; accounts: ExpenseAccount[]; run: ExpenseRun; busy: boolean }) {
 const { t, locale } = useI18n(), p = row.payout, [id] = useState(() => crypto.randomUUID());
 const companyExpense = row.origin === "company_purchase", alreadyPaid = companyExpense && row.creator_payment_fact === "company_paid";
 const [account, setAccount] = useState(p?.bank_account_id || p?.cash_location_id || ""), [paidOn, setPaidOn] = useState(p?.paid_on || bangkokToday());
 const [withhold, setWithhold] = useState(false), [ack, setAck] = useState(false), [cancelAck, setCancelAck] = useState(false);
 const money = (v: number) => `${v.toLocaleString(locale, { minimumFractionDigits: 2 })} THB`;
 const available = accounts.filter(a => (companyExpense || a.can_record) && (row.settlement?.mode !== "company_bank" || a.kind === "bank") && (row.settlement?.mode !== "company_cash" || a.kind === "cash"));
 const selectedAccount = available.find(a => a.id === account);
 const blockedAccount = companyExpense && (!selectedAccount || expenseAccountBlocked(selectedAccount));
 if (p?.status === "confirmed") return <Callout tone="success">{t(row.origin === "employee_claim" ? "expenses.claimRefunded" : "expenses.paid")}: {money(p.net)}{row.origin !== "employee_claim" ? <><br />{t("expenses.wht")}: {money(p.wht)}</> : null}</Callout>;
 if (row.obligation?.waived || !row.settlement || ["undecided", "no_reimbursement"].includes(row.settlement.mode)) return null;
 return <section className={css.paymentPanel} id="payment"><h3><Wallet size={18} aria-hidden="true" /> {t("expenses.paymentReview")}</h3>
  {row.reviewed_recipient_name ? <p>{t("expenses.payee")}: {row.reviewed_recipient_name}</p> : null}
  {(!p || p.status === "cancelled") && access.can_manage ? <form className={css.form} onSubmit={async e => { e.preventDefault(); const a = available.find(a => a.id === account); await run("prepare_finance_expense_payout", { p_id: id, p_expense: row.id, p_version: null, p_paid_on: paidOn, p_bank: a?.bank_account_id || null, p_cash: a?.cash_location_id || null, p_actual_wht: row.personally_paid ? false : row.tax_review?.request_json?.schema_version === 2 ? row.tax_review.wht_state === "withhold" : withhold, p_note: "" }); }}>
   <AccountSelect accounts={available} value={account} onChange={setAccount} disabled={busy} showReadiness={companyExpense} />
   <FieldGroup id="payout-date" label={t("expenses.paidOn")}><input type="date" required min={row.expense_date} max={bangkokToday()} value={paidOn} disabled={busy} onChange={e => setPaidOn(e.target.value)} /></FieldGroup>
   {row.tax_review?.wht_state === "withhold" && !row.personally_paid && row.tax_review.request_json?.schema_version !== 2 ? <label className={css.check}><input type="checkbox" checked={withhold} disabled={busy} onChange={e => setWithhold(e.target.checked)} /><span>{t("expenses.actualWithholding")}</span></label> : null}
   <button className={ui.primary} type="submit" disabled={busy || !account || blockedAccount}><Save size={17} aria-hidden="true" />{t(alreadyPaid ? "expenses.recordPaidOutflow" : "expenses.preparePayment")}</button>
  </form> : null}
  {p?.status === "draft" ? <><dl className={css.facts}><div><dt>{t("expenses.account")}</dt><dd>{accounts.find(a => a.id === (p.bank_account_id || p.cash_location_id))?.name || t("expenses.optional")}</dd></div><div><dt>{t("expenses.paidOn")}</dt><dd>{p.paid_on}</dd></div><div><dt>{t("expenses.cashNet")}</dt><dd><strong>{money(p.net)}</strong></dd></div><div><dt>{t("expenses.wht")}</dt><dd>{money(p.wht)}</dd></div>{p.destination ? <div className={css.span}><dt>{t("expenses.payee")}</dt><dd>{p.destination.account_name}<br />{p.destination.bank_name} {p.destination.account_number}</dd></div> : null}</dl>
   {companyExpense && (!p.can_confirm || !selectedAccount || expenseAccountIssue(selectedAccount)) ? <Callout tone="warning">{t(`expenses.${!p.can_confirm ? "accountConfirmDenied" : selectedAccount ? expenseAccountIssue(selectedAccount) || "accountNotReady" : "accountNotReady"}`)}</Callout> : null}
   {p.can_confirm ? <div className={css.form}><label className={css.check}><input type="checkbox" checked={ack} disabled={busy} onChange={e => setAck(e.target.checked)} /><span>{t("expenses.paymentAck")}</span></label><button type="button" className={ui.primary} disabled={busy || !ack} onClick={() => void run("confirm_finance_payout", { p_id: p.id, p_expected_version: p.version, p_expected_payee_version: p.payee_version, p_expected_destination_id: p.destination?.id || null, p_acknowledged: ack })}><Send size={17} aria-hidden="true" />{t("expenses.confirmPayment")}</button></div> : null}
   {p.can_cancel ? <details className={css.disclosure}><summary>{t("expenses.cancelPayment")}</summary><div className={css.form}><label className={css.check}><input type="checkbox" checked={cancelAck} disabled={busy} onChange={e => setCancelAck(e.target.checked)} /><span>{t("expenses.cancelAck")}</span></label><button type="button" className={ui.secondary} disabled={busy || !cancelAck} onClick={() => void run("cancel_finance_payout", { p_id: p.id, p_expected_version: p.version, p_acknowledged: cancelAck })}>{t("expenses.cancelPayment")}</button></div></details> : null}
  </> : null}
 </section>;
}
