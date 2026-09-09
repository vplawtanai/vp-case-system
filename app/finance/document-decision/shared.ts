import { taxError } from "../tax-invoices/shared";
import { translate } from "../../../lib/i18n/catalog";
import type { UiLocale } from "../../../lib/i18n/core";

export type VatTreatment = "standard_rate" | "zero_rated" | "exempt" | "outside_scope" | "disbursement" | "pass_through" | "unknown";
export type VatEvidence = { schema_version?: number; treatment: VatTreatment; reason?: string | null; basis?: string };
export const vatTreatmentLabels: Record<VatTreatment, string> = {
  standard_rate: "VAT ตามอัตราต้นทาง", zero_rated: "VAT 0% (อัตราศูนย์)", exempt: "ยกเว้น VAT",
  outside_scope: "ไม่อยู่ในบังคับ VAT", disbursement: "เงินทดรองจ่ายแทนที่ได้รับการรับรอง", pass_through: "รายการผ่านบัญชีที่ได้รับการรับรอง", unknown: "ยังไม่ระบุ VAT Treatment",
};
const vatMessageKeys: Record<VatTreatment, string> = {
  standard_rate: "standard", zero_rated: "zeroRated", exempt: "exempt", outside_scope: "outsideScope",
  disbursement: "disbursement", pass_through: "passThrough", unknown: "unknown",
};
export function vatTreatmentLabel(treatment: VatTreatment, locale: UiLocale = "th", rate?: number | string) {
  return treatment === "standard_rate" && rate !== undefined
    ? translate(locale, "finance.vat.standardRate", { rate })
    : translate(locale, `finance.vat.${vatMessageKeys[treatment] || "unknown"}`);
}
export function resolveVatEvidence(evidence: VatEvidence | null | undefined, applicable: boolean, rate: number): VatTreatment {
  if (applicable && rate > 0 && rate <= 100) return !evidence || ["unknown", "standard_rate"].includes(evidence.treatment) ? "standard_rate" : "unknown";
  if (!evidence?.reason?.trim() || rate !== 0) return "unknown";
  if (applicable) return evidence.treatment === "zero_rated" ? "zero_rated" : "unknown";
  return ["exempt", "outside_scope", "disbursement", "pass_through"].includes(evidence.treatment) ? evidence.treatment : "unknown";
}
export type DocumentLine = { id: string; invoice_id: string; description: string; amount_before_vat: number | string; vat_amount: number | string; line_total: number | string; vat_rate: number | string; resolved_vat_treatment: VatEvidence };
export type DocumentDecision = {
  decision: string; lines: DocumentLine[]; unknown_lines?: DocumentLine[]; blockers?: string[];
  receipt_id?: string | null; receipt_status?: string | null; tax_invoice_id?: string | null; tax_invoice_status?: string | null;
  combined_id?: string | null; combined_status?: string | null;
};
export const documentDecisionLabels: Record<string, string> = {
  receipt_only: translate("th", "finance.decision.receiptOnly"), combined_receipt_tax_invoice: translate("th", "finance.decision.combined"),
  tax_invoice_completion_only: translate("th", "finance.decision.taxCompletion"), receipt_completion_only: translate("th", "finance.decision.receiptCompletion"),
  complete: translate("th", "finance.decision.complete"), blocked_unknown_treatment: translate("th", "finance.decision.unknown"),
  blocked_partial_taxable: translate("th", "finance.decision.partial"),
  blocked_multiple_invoices: translate("th", "finance.decision.multipleInvoices"),
  blocked_payment: translate("th", "finance.decision.paymentRequired"),
};
const decisionMessageKeys: Record<string, string> = {
  receipt_only: "receiptOnly", combined_receipt_tax_invoice: "combined", tax_invoice_completion_only: "taxCompletion",
  receipt_completion_only: "receiptCompletion", complete: "complete", blocked_unknown_treatment: "unknown",
  blocked_partial_taxable: "partial", blocked_multiple_invoices: "multipleInvoices", blocked_payment: "paymentRequired",
};
export function documentDecisionLabel(decision: string, locale: UiLocale = "th") {
  return decisionMessageKeys[decision] ? translate(locale, `finance.decision.${decisionMessageKeys[decision]}`) : translate(locale, "finance.document.reviewSource");
}
export function documentError(error: unknown, locale: UiLocale = "th"): string {
  const message = typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String(error.message) : "";
  for (const key of Object.keys(documentDecisionLabels)) if (message.includes("DOCUMENT_ROUTE_" + key.toUpperCase())) return documentDecisionLabel(key, locale);
  const known: Record<string,string> = {
    DOCUMENT_PERMISSION_DENIED: translate("th", "finance.document.error.permission"), DOCUMENT_EXTERNAL_CHECK_REQUIRED: translate("th", "finance.document.error.external"),
    DOCUMENT_EXISTING_STANDALONE_DRAFT: translate("th", "finance.document.error.standaloneDraft"),
    DOCUMENT_SOURCE_CHANGED: translate("th", "finance.document.error.sourceChanged"), DOCUMENT_STALE_REVIEW: translate("th", "finance.document.error.staleReview"),
    DOCUMENT_USE_COMBINED_WORKFLOW: translate("th", "finance.document.error.useCombined"),
    DOCUMENT_UNKNOWN_TREATMENT_BEFORE_ISSUE: translate("th", "finance.document.error.unknownBeforeIssue"),
    DOCUMENT_VAT_CONFLICT: translate("th", "finance.document.error.vatConflict"), DOCUMENT_CORRECTION_WORKFLOW_REQUIRED: translate("th", "finance.document.error.correctionRequired"),
  };
  const keys: Record<string, string> = {
    DOCUMENT_PERMISSION_DENIED: "permission", DOCUMENT_EXTERNAL_CHECK_REQUIRED: "external",
    DOCUMENT_EXISTING_STANDALONE_DRAFT: "standaloneDraft", DOCUMENT_SOURCE_CHANGED: "sourceChanged",
    DOCUMENT_STALE_REVIEW: "staleReview", DOCUMENT_USE_COMBINED_WORKFLOW: "useCombined",
    DOCUMENT_UNKNOWN_TREATMENT_BEFORE_ISSUE: "unknownBeforeIssue", DOCUMENT_VAT_CONFLICT: "vatConflict",
    DOCUMENT_CORRECTION_WORKFLOW_REQUIRED: "correctionRequired",
  };
  for (const code of Object.keys(known)) if (message.includes(code)) return translate(locale, `finance.document.error.${keys[code]}`);
  return taxError(error, locale);
}
