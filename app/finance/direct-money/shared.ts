import { calculateFinanceLineAmounts } from "../finance-line-amounts";
import { calculateStructuredWht } from "../payments/tax";
import { resolveVatEvidence, type VatEvidence } from "../document-decision/shared";
import { translate } from "../../../lib/i18n/catalog";
import type { UiLocale } from "../../../lib/i18n/core";

export const moneyNatures = ["business_revenue", "client_money", "owner_or_partner_funding", "loan_or_deposit", "reimbursement_or_pass_through", "other_non_revenue", "unclassified"] as const;
export const economicClasses = ["professional_fee", "additional_service", "reimbursable_expense", "government_or_court_fee"] as const;
export type DirectLine = {
  source_line_id: string; description: string; reason: string; money_nature: typeof moneyNatures[number];
  classification: string | null; base: number; vat_applicable: boolean; vat_rate: number; vat_treatment_json: VatEvidence | null;
  wht_applicability: "applies" | "does_not_apply" | "unknown"; wht_base: number | null; wht_rate: number | null;
};
export type DirectInput = {
  client_id: string | null; payer_name: string; case_id: number | null; advisory_matter_id: string | null;
  received_on: string; method: "bank_transfer" | "cash" | "other"; receiving_bank_account_id: string | null; cash_location: string | null;
  currency: "THB"; cash_amount: number; reference_no: string | null; evidence_reference: string | null; note: string; lines: DirectLine[];
};
export type DirectRecord = Omit<DirectInput, "lines"> & {
  id: string; status: "draft" | "confirmed" | "reversed"; version: number; unclassified: boolean;
  input_json: DirectInput; lines_json: (DirectLine & { cash: number; wht: number; vat: number; gross: number })[];
  wht_amount: number; vat_amount: number; amount_before_vat: number; gross_amount: number;
  created_at: string; confirmed_at: string | null; reversed_at: string | null; reversal_reason: string | null;
  confirmed_snapshot_json: { bank?: { short_name: string; bank_name: string }; client?: { id: string; name: string } | null } | null;
  classification_json: { lines: DirectRecord["lines_json"]; reason: string; actor_id: string; created_at: string } | null;
};
export function newDirectLine(): DirectLine {
  return { source_line_id: crypto.randomUUID(), description: "", reason: "", money_nature: "unclassified", classification: null, base: 0,
    vat_applicable: false, vat_rate: 0, vat_treatment_json: null, wht_applicability: "unknown", wht_base: null, wht_rate: null };
}
export function newDirectInput(): DirectInput {
  return { client_id: null, payer_name: "", case_id: null, advisory_matter_id: null, received_on: "", method: "bank_transfer", receiving_bank_account_id: null,
    cash_location: null, currency: "THB", cash_amount: 0, reference_no: null, evidence_reference: null, note: "", lines: [newDirectLine()] };
}
export function directLineAmounts(line: DirectLine) {
  const amounts = calculateFinanceLineAmounts(1, line.base, line.vat_applicable ? "vat_exclusive" : "non_vat", line.vat_rate);
  const calculated = line.wht_applicability === "applies" ? calculateStructuredWht(line.wht_base, String(line.wht_rate ?? ""), amounts.totalAmount.toFixed(2)) : null;
  const wht = line.wht_applicability === "does_not_apply" ? 0 : calculated ? Number(calculated.whtAmount) : null;
  return { base: amounts.amountBeforeVat, vat: amounts.vatAmount, gross: amounts.totalAmount, wht, cash: wht === null ? null : Math.round((amounts.totalAmount - wht) * 100) / 100 };
}
export function directTotals(lines: DirectLine[]) {
  const rows = lines.map(directLineAmounts);
  const sum = (field: "base" | "vat" | "gross" | "wht" | "cash") => rows.some(row => row[field] === null || !Number.isFinite(row[field])) ? null : rows.reduce((value, row) => value + Math.round(row[field]! * 100), 0) / 100;
  return { base: sum("base"), vat: sum("vat"), gross: sum("gross"), wht: sum("wht"), cash: sum("cash") };
}
const decimal = (value: number | null, places: number, positive = false) => value !== null && Number.isFinite(value) && value >= 0 && (!positive || value > 0) && new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(String(value));
export function validateDirectInput(input: DirectInput, today: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.payer_name.trim()) errors.payer_name = "required";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.received_on) || input.received_on > today) errors.received_on = "dateInvalid";
  if (input.method === "bank_transfer" ? !input.receiving_bank_account_id : !input.cash_location?.trim()) errors.account = "required";
  if (!decimal(input.cash_amount, 2, true)) errors.cash_amount = "amountInvalid";
  if (!input.lines.length || input.lines.length > 100) errors.lines = "linesRequired";
  const seen = new Set<string>();
  input.lines.forEach((line, index) => {
    const key = `line.${index}.`;
    if (!line.description.trim()) errors[key + "description"] = "required";
    if (!line.reason.trim()) errors[key + "reason"] = "required";
    if (seen.has(line.source_line_id)) errors.lines = "linesRequired";
    seen.add(line.source_line_id);
    if (line.money_nature === "business_revenue" && !economicClasses.some(value => value === line.classification)) errors[key + "classification"] = "required";
    if (!decimal(line.base, 2, true) || line.base > 999999999999) errors[key + "base"] = "amountInvalid";
    if (!decimal(line.vat_rate, 4) || line.vat_rate > 100) errors[key + "vat_rate"] = "rateInvalid";
    if (line.money_nature !== "unclassified" && resolveVatEvidence(line.vat_treatment_json, line.vat_applicable, line.vat_rate) === "unknown") errors[key + "vat"] = "vatRequired";
    if (line.wht_applicability === "unknown") errors[key + "wht"] = "required";
    if (line.wht_applicability === "applies" && (!decimal(line.wht_base, 2, true) || line.wht_base! > line.base || !directLineAmounts(line).wht)) errors[key + "wht"] = "whtInvalid";
  });
  const total = directTotals(input.lines);
  if (total.cash === null || Math.round(input.cash_amount * 100) !== Math.round(total.cash * 100)) errors.reconcile = "reconcile";
  return errors;
}
export function directMoneyError(error: unknown, locale: UiLocale): string {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "23505") return translate(locale, "directMoney.error.duplicate");
  if (message.includes("SUPERSEDE_REQUIRED")) return translate(locale, "vpDistribution.error.SUPERSEDE_REQUIRED");
  if (message.includes("STALE")) return translate(locale, "directMoney.error.stale");
  if (message.includes("PERMISSION_DENIED")) return translate(locale, "directMoney.error.permission");
  if (message.includes("RECONCILE")) return translate(locale, "directMoney.error.reconcile");
  if (message.includes("VAT")) return translate(locale, "directMoney.error.vatRequired");
  if (message.includes("WHT")) return translate(locale, "directMoney.error.whtInvalid");
  return translate(locale, "directMoney.error.failed");
}
