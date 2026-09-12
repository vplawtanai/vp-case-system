import { translate } from "../../../lib/i18n/catalog";
import type { UiLocale } from "../../../lib/i18n/core";
export const correctionModes = ["credit_note", "debit_note", "cancel_and_reissue", "replacement_copy"] as const;
export type CorrectionMode = typeof correctionModes[number];
export const correctionBases: Record<CorrectionMode, string[]> = {
  credit_note: ["service_overcharge", "service_reduction", "service_cancelled"],
  debit_note: ["service_undercharge", "additional_service"],
  cancel_and_reissue: ["documentary_identity_error"], replacement_copy: ["lost", "destroyed", "materially_damaged"],
};
export type CorrectionRow = {
  id: string; original_tax_invoice_id: string; original_combined_document_id: string | null; source_correction_id: string | null;
  correction_mode: CorrectionMode; status: "draft" | "approved" | "issued" | "cancelled";
  draft_snapshot_json: Record<string, unknown>; source_snapshot_json: Record<string, unknown>; reason: string; issue_date: string;
};
export type CorrectionDocumentRow = { id: string; document_no: string; document_type: string; document_date: string; issued_at: string; issued_snapshot_json: Record<string, unknown> };
export type CorrectionContext = {
  source: { document_no: string; document_date: string; source_correction_id: string | null };
  items: { id: string; amount_before_vat: string; vat_amount: string; source_snapshot_json: { description: string } }[];
  history: { id: string; mode: CorrectionMode; status: string; number: string | null; source_correction_id: string | null; created_at: string; document_date: string | null }[];
};
export function correctionError(error: unknown, locale: UiLocale) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
  const kind = /PERMISSION|permission denied/.test(message) ? "permission" : /COVERAGE|AMOUNT|VAT_INVALID/.test(message) ? "coverage"
    : /OPEN_CASE|evidence_once|IDEMPOTENCY/.test(message) ? "duplicate" : /BUYER/.test(message) ? "buyer"
      : /REVIEW|ACK|APPROVAL|SUPERSEDED/.test(message) ? "review" : /REQUIRED|INVALID|INCOMPATIBLE/.test(message) ? "required" : "failed";
  return translate(locale, "taxCorrection.error." + kind);
}
export function validCorrectionInput(mode: string, reason: string, evidence: string, basis: string, date: string, eventDate: string, lines: { item_id: string; base_change: string }[]) {
  return correctionModes.includes(mode as CorrectionMode) && correctionBases[mode as CorrectionMode].includes(basis)
    && reason.trim().length >= 5 && evidence.trim().length >= 5 && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{4}-\d{2}-\d{2}$/.test(eventDate)
    && eventDate <= date && ((mode === "credit_note" || mode === "debit_note") ? lines.length > 0 && lines.every(l => /^\d+(\.\d{1,2})?$/.test(l.base_change) && Number(l.base_change) > 0) : lines.length === 0);
}
