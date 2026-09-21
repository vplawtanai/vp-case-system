import type { Expense, ExpenseLookups, SettlementMode } from "./shared";

export const creatorPaymentLabel = (row: Pick<Expense, "creator_payment_fact">) => row.creator_payment_fact == null ? "companyDeclarationUnavailable" : ({ unpaid: "companyUnpaid", company_paid: "handlingCompanyPaid", personal_paid: "companyPersonalPaid", unknown: "companyPaymentUnknown" }[row.creator_payment_fact]);
// 051 guarantees external => profile_id NULL; internal => profile_id = active person identity.
export const supplierCandidates = (lookups: ExpenseLookups) => lookups.payees.filter(p => p.profile_id === null);
export const companyUnpaidFlow = (row: Expense) => !row.personally_paid && row.creator_payment_fact === "unpaid";
export const companyHistoricalMoney = (row?: Expense) => !!row && row.version > 0 && (row.personally_paid || ["personal_paid", "unknown"].includes(row.creator_payment_fact || ""));
export const companyMoneyIncomplete = (items: { creator_payment_fact?: unknown }[]) => items.some(i => i.creator_payment_fact == null);
export function companyMoneyModes(row: Expense): SettlementMode[] {
 if (row.personally_paid) return ["undecided", "reimburse", "no_reimbursement"];
 if (companyUnpaidFlow(row)) return ["supplier_unpaid"];
 return row.creator_payment_fact === "company_paid" ? ["undecided", "company_bank", "company_cash"] : ["undecided", "company_bank", "company_cash", "supplier_unpaid"];
}
export function recommendedMoneyMode(row: Expense): SettlementMode {
 if (row.personally_paid) return "reimburse";
 return row.creator_payment_fact === "unpaid" ? "supplier_unpaid" : "undecided";
}
export function companyMoneyCandidates(row: Expense, lookups: ExpenseLookups, mode: string) {
 if (mode === "reimburse") return lookups.payees.filter(p => !!row.claimant_id && p.profile_id === row.claimant_id);
 if (mode === "supplier_unpaid") return supplierCandidates(lookups).filter(p => !row.supplier_payee_id || p.id === row.supplier_payee_id);
 return [];
}

// Readiness is client-side review guidance, not an alternative tax/settlement calculation.
// The existing RPCs still validate amounts, evidence, permissions and concurrent changes.
export function companyApprovalMissing(row: Expense, money: Record<string, unknown> | null, tax: Record<string, unknown> | null, reason: string, lookups: ExpenseLookups, calculation?: import("./company-tax").CompanyTaxCalculation | null) {
 const missing: string[] = [];
 const mode = row.settlement?.mode || String(money?.p_mode || "undecided");
 if (mode === "undecided" || !companyMoneyModes(row).includes(mode as SettlementMode)) missing.push(row.creator_payment_fact === "company_paid" ? "companyNeedPaidChannel" : "companyNeedMoney");
 if (!row.settlement && ["supplier_unpaid", "reimburse"].includes(mode)) {
  if (!companyMoneyCandidates(row, lookups, mode).some(p => p.id === money?.p_payee)) missing.push(mode === "reimburse" ? "companyNeedPayer" : "companyNeedSupplier");
  const amount = money?.p_amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > row.gross_amount || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) missing.push("companyNeedAmount");
 }
 if (calculation !== undefined) {
  if (!row.settlement && ["company_bank", "company_cash", "supplier_unpaid"].includes(mode) && money?.p_amount !== calculation?.gross) missing.push("companyTaxCalculating");
  return [...missing, ...(calculation?.missing || ["companyTaxCalculating"])];
 }
 const t = row.tax_review && !tax ? row.tax_review : tax;
 if (!t || !["none", "exists"].includes(String(t.vat_state)) || t.eligibility === "pending" || (t.vat_state === "none" && t.eligibility !== "ineligible")) missing.push("companyNeedVat");
 if (t?.vat_state === "exists") {
  const base = t.vat_base, rate = t.vat_rate;
  if (typeof base !== "number" || !Number.isFinite(base) || base <= 0 || typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 100 || Math.abs(base * 100 - Math.round(base * 100)) > 0.000001 || Math.round(base * 100) + Math.round(base * rate) !== Math.round(row.gross_amount * 100)) missing.push("companyNeedVatAmounts");
  if (t.eligibility === "eligible" && (t.company_name_status !== "yes" || !/^\d{13}$/.test(String(t.supplier_tax_id || "")) || !String(t.tax_document_reference || "").trim() || !t.tax_document_date)) missing.push("companyNeedVatEvidence");
 }
 if (!t || !["none", "withhold"].includes(String(t.wht_state))) missing.push("companyNeedWht");
 if (t?.wht_state === "withhold") {
  const base = t.wht_base, rate = t.wht_rate;
  if (typeof base !== "number" || !Number.isFinite(base) || base <= 0 || base > row.gross_amount || typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0 || rate >= 100 || Math.abs(base * 100 - Math.round(base * 100)) > 0.000001) missing.push("companyNeedWhtAmounts");
  if (row.personally_paid || (row.payout?.status === "confirmed" && row.payout.wht === 0)) missing.push("companyWhtExceptionBlock");
 }
 if (!reason.trim()) missing.push("companyNeedReason");
 return missing;
}
