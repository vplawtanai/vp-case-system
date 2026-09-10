import { uiMessage, type UiMessage } from "../../../lib/i18n/core";
import { calculateStructuredWht, type InvoiceTaxFacts, type WhtComponent } from "./tax";

export const lineWhtRates = ["1", "2", "3", "5", "10"] as const;
export type WhtLineChoice = {
  invoiceItemId: string;
  applicability: "unknown" | "applies" | "does_not_apply";
  rate: string;
  customRate: boolean;
};
export type WhtLineIssue = { invoiceItemId: string; message: UiMessage };
const rule = "line_review_full_invoice_v2";
const cents = (value: number | string) => Math.round(Number(value) * 100);
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function initialWhtLineChoices(facts: InvoiceTaxFacts | null): WhtLineChoice[] {
  return facts?.lines.map(line => ({ invoiceItemId: line.id, applicability: "unknown", rate: "", customRate: false })) || [];
}

export function whtLineScope(facts: InvoiceTaxFacts | null, target: string, outstanding: number, allocationCount: number, savedSettlement: number) {
  if (!facts || facts.version !== 2 || facts.lines.some(line => line.beforeVat <= 0)) return uiMessage("finance.payment.wht.snapshot");
  if (allocationCount !== 1) return uiMessage("finance.payment.wht.lines.singleInvoice");
  // 041 cannot silently expand a previously partial Payment into full settlement.
  if (cents(target) !== cents(facts.gross) || cents(outstanding) !== cents(facts.gross) || cents(savedSettlement) !== cents(facts.gross)) return uiMessage("finance.payment.wht.partial");
  return null;
}

export function evaluateWhtLines(facts: InvoiceTaxFacts | null, choices: WhtLineChoice[]) {
  const issues: WhtLineIssue[] = [];
  let sum = 0;
  const amounts: Record<string, string> = {};
  if (!facts || facts.version !== 2) return { issues, amounts, totals: null };
  for (const [index, line] of facts.lines.entries()) {
    const matching = choices.filter(choice => choice.invoiceItemId === line.id);
    const choice = matching[0];
    const parameters = { line: line.description?.trim() || `#${index + 1}` };
    let key = "";
    if (matching.length > 1) key = "finance.payment.wht.lines.duplicate";
    else if (!choice || choice.applicability === "unknown") key = "finance.payment.wht.lines.applicabilityRequired";
    else if (choice.applicability === "does_not_apply") amounts[line.id] = "0.00";
    else if (choice.applicability === "applies") {
      const calculated = calculateStructuredWht(line.beforeVat, choice.rate, line.gross.toFixed(2));
      if (!calculated) key = "finance.payment.wht.lines.rateRequired";
      else { amounts[line.id] = calculated.whtAmount; sum += cents(calculated.whtAmount); }
    } else key = "finance.payment.wht.lines.applicabilityRequired";
    if (key) issues.push({ invoiceItemId: line.id, message: uiMessage(key, parameters) });
  }
  if (choices.some(choice => !facts.lines.some(line => line.id === choice.invoiceItemId))) issues.push({ invoiceItemId: "", message: uiMessage("finance.payment.wht.lines.evidenceChanged") });
  const gross = cents(facts.gross);
  const totals = !issues.length && sum <= gross ? { whtAmount: (sum / 100).toFixed(2), cashAmount: ((gross - sum) / 100).toFixed(2) } : null;
  return { issues, amounts, totals };
}

// A UI selection is restored only from 041's explicit evidence, never from a
// matching amount, VAT flag, description, economic classification or live source.
export function restoreWhtLineChoices(facts: InvoiceTaxFacts | null, components: WhtComponent[], paymentId: string) {
  const choices = initialWhtLineChoices(facts);
  let valid = Boolean(facts && facts.version === 2 && components.length === choices.length);
  for (const [index, choice] of choices.entries()) {
    const line = facts!.lines[index];
    const matches = components.filter(component => component.invoice_item_id === line.id);
    const component = matches[0];
    const envelope = object(component?.basis_snapshot_json), basis = object(envelope.basis);
    const expectedBasis = { invoice_id: facts!.invoiceId, invoice_item_id: line.id, currency: facts!.currency,
      amount_before_vat: line.beforeVat, vat_amount: line.vat, total_amount: line.gross, vat_applicable: line.vatApplicable, calculation_rule: rule };
    const basisMatches = Object.keys(basis).length === Object.keys(expectedBasis).length
      && Object.entries(expectedBasis).every(([key, value]) => basis[key] === value);
    if (matches.length !== 1 || component.payment_id !== paymentId || component.invoice_id !== facts!.invoiceId || component.calculation_rule !== rule
      || !basisMatches || Object.keys(envelope).length !== 2 || Number(component.base_amount) !== line.beforeVat
      || (envelope.applicability !== "applies" && envelope.applicability !== "does_not_apply")) { valid = false; continue; }
    const rate = component.rate_percent === null ? "" : String(Number(component.rate_percent));
    const calculated = envelope.applicability === "applies" ? calculateStructuredWht(line.beforeVat, rate, line.gross.toFixed(2)) : null;
    if (envelope.applicability === "applies" ? !calculated || Number(calculated.whtAmount) !== Number(component.calculated_wht_amount)
      : component.rate_percent !== null || Number(component.calculated_wht_amount) !== 0) { valid = false; continue; }
    choices[index] = { ...choice, applicability: envelope.applicability, rate, customRate: Boolean(rate && !lineWhtRates.some(preset => preset === rate)) };
  }
  return { choices, valid };
}

export function whtLinePayload(choices: WhtLineChoice[]) {
  return choices.map(choice => ({ invoice_item_id: choice.invoiceItemId, applicability: choice.applicability,
    rate_percent: choice.applicability === "applies" ? Number(choice.rate) : null }));
}

export function whtLineFingerprint(choices: WhtLineChoice[]) {
  return JSON.stringify(choices.map(choice => [choice.invoiceItemId, choice.applicability, choice.applicability === "applies" ? choice.rate : ""]).sort((a, b) => a[0].localeCompare(b[0])));
}

export function whtLineRpcError(error: unknown, facts: InvoiceTaxFacts | null): UiMessage | null {
  const source = object(error);
  const keys: Record<string, string> = {
    WHT_LINE_APPLICABILITY_REQUIRED: "finance.payment.wht.lines.applicabilityRequired",
    WHT_LINE_RATE_REQUIRED: "finance.payment.wht.lines.rateRequired",
    WHT_LINE_RATE_ROUNDS_TO_ZERO: "finance.payment.wht.lines.rateRequired",
    WHT_NON_APPLICABLE_RATE_NOT_ALLOWED: "finance.payment.wht.lines.rateRequired",
  };
  if (typeof source.message !== "string") return null;
  if (keys[source.message]) {
    let details: Record<string, unknown> = {};
    try { details = object(JSON.parse(String(source.details))); } catch { /* Only consume the known line ID, never display database details. */ }
    const index = facts?.lines.findIndex(line => line.id === details.invoice_item_id) ?? -1;
    return index >= 0 ? uiMessage(keys[source.message], { line: facts!.lines[index].description?.trim() || `#${index + 1}` }) : uiMessage("finance.payment.wht.lines.resolveAll");
  }
  if (["WHT_DUPLICATE_LINE", "WHT_UNKNOWN_SOURCE_LINE", "WHT_LINE_CHOICE_INVALID", "WHT_LINE_CHOICES_REQUIRED"].includes(source.message)) return uiMessage("finance.payment.wht.lines.evidenceChanged");
  return null;
}
