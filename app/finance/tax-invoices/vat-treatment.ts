import { translate } from "../../../lib/i18n/catalog";
import type { UiLocale } from "../../../lib/i18n/core";

import { invoiceTaxFacts } from "../payments/tax";
import { taxError, taxObject, taxText } from "./shared";
import { resolveVatEvidence, type VatEvidence, type VatTreatment } from "../document-decision/shared";

export type { VatTreatment } from "../document-decision/shared";
export type VatTreatmentPresentation = { label: string; workflow: "applies" | "not_applicable" | "unresolved"; status: string; explanation: string };
export const unknownVatExplanation = translate("th", "finance.taxInvoice.vatSummary.unknownExplanation");
export const unknownTaxDecision = translate("th", "finance.taxInvoice.vatSummary.unknownDecision");
export const vatSummaryUnavailable = translate("th", "finance.taxInvoice.vatSummary.unavailable");

// Display vocabulary, not a decoder of free-text tax_category or economic classification.
export function vatTreatmentPresentation(treatment: VatTreatment, rate: number | null, locale: UiLocale = "th"): VatTreatmentPresentation {
  switch (treatment) {
    case "standard_rate":
      if (rate !== null && Number.isFinite(rate) && rate > 0 && rate <= 100) return {
        label: `VAT ${rate}%`, workflow: "applies", status: translate(locale, "finance.taxInvoice.vatSummary.required"),
        explanation: translate(locale, "finance.taxInvoice.vatSummary.standardExplanation"),
      };
      break;
    case "zero_rated": return {
      label: translate(locale, "finance.taxInvoice.vatSummary.zero"), workflow: "applies", status: translate(locale, "finance.taxInvoice.vatSummary.required"),
      explanation: translate(locale, "finance.taxInvoice.vatSummary.zeroExplanation"),
    };
    case "exempt": return {
      label: translate(locale, "finance.taxInvoice.vatSummary.exempt"), workflow: "not_applicable", status: translate(locale, "finance.taxInvoice.vatSummary.notApplicable"),
      explanation: translate(locale, "finance.taxInvoice.vatSummary.exemptExplanation"),
    };
    case "disbursement":
    case "pass_through":
    case "outside_scope": return {
      label: translate(locale, "finance.taxInvoice.vatSummary.outsideScope"), workflow: "not_applicable", status: translate(locale, "finance.taxInvoice.vatSummary.notApplicable"),
      explanation: translate(locale, "finance.taxInvoice.vatSummary.outsideExplanation"),
    };
  }
  return { label: translate(locale, "finance.taxInvoice.vatSummary.unknown"), workflow: "unresolved", status: translate(locale, "finance.taxInvoice.vatSummary.unresolved"), explanation: translate(locale, "finance.taxInvoice.vatSummary.unknownDecision") };
}

export type InvoiceVatLine = {
  invoiceId: string; invoiceNumber: string; id: string; description: string; currency: string;
  beforeVat: number; vat: number; treatment: VatTreatment; rate: number | null;
};

export const vatConfirmationBlocker = "TAX_INVOICE_VAT_TREATMENT_UNRESOLVED";

export function vatEligibilityBlockerMessage(code: string, lines: InvoiceVatLine[] | null, locale: UiLocale = "th"): string {
  if (code === vatConfirmationBlocker && lines?.length && lines.every(line => line.treatment === "standard_rate"
    && vatTreatmentPresentation(line.treatment, line.rate).workflow === "applies")) {
    const rates = [...new Set(lines.map(line => vatTreatmentPresentation(line.treatment, line.rate).label))];
    return translate(locale, "finance.taxInvoice.vatSummary.confirmDetected", { rates: rates.join(", ") });
  }
  return taxError(code, locale);
}

export function invoiceVatLines(snapshot: unknown, expectedInvoiceId: string): InvoiceVatLine[] {
  const facts = invoiceTaxFacts(snapshot);
  if (!facts || facts.invoiceId !== expectedInvoiceId) throw new Error("Invalid frozen VAT source");
  const source = taxObject(snapshot), invoice = taxObject(source.invoice);
  const entries = source.items as unknown[];
  return facts.lines.map((factsLine, index) => {
    const item = taxObject(facts.version === 2 ? taxObject(entries[index]).invoice_item : entries[index]);
    const description = taxText(item.description), invoiceNumber = taxText(invoice.invoice_no);
    if (!description || !invoiceNumber) throw new Error("Incomplete frozen VAT source");
    const rateValue = item.vat_rate;
    const rate = (typeof rateValue === "number" || typeof rateValue === "string") && /^\d+(?:\.\d{1,4})?$/.test(String(rateValue))
      && Number(rateValue) <= 100 ? Number(rateValue) : null;
    const treatment = resolveVatEvidence(item.vat_treatment_json as VatEvidence | null, factsLine.vatApplicable, rate ?? NaN);
    return { invoiceId: facts.invoiceId, invoiceNumber, id: factsLine.id, description, currency: facts.currency,
      beforeVat: factsLine.beforeVat, vat: factsLine.vat, treatment, rate };
  });
}
