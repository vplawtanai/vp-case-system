export type TaxSource = {
 source_type: "payment" | "direct_money_receipt" | "tax_invoice" | "tax_correction";
 source_id: string; reference: string | null; effective_on: string; currency: string;
 payer: { name?: string | null }; warnings: string[];
 lines: { kind: string; base: number | null; rate: number | null; tax: number }[];
};
export type TaxFact = {
 id: string; tax_kind: "output_vat" | "incoming_wht"; source_type: TaxSource["source_type"]; source_id: string;
 document_reference: string | null; period_month: string; effective_on: string; currency: string;
 base_amount: number | null; rate_percent: number | null; tax_amount: number; treatment: string; date_basis: string;
 payer_json: { name?: string | null }; evidence_status: string; certificate_reference: string | null;
 source_revision: number; evidence_json: unknown;
};
export type TaxPeriod = { period_month: string; status: "open" | "ready_for_review" | "filed"; version: number;
 known_output_vat: number; input_vat_status: "incomplete"; input_vat_amount: null; net_vat_amount: null; filing_reference: string | null; filed_on: string | null };
export type TaxPositionData = { can_manage: boolean; can_materialize: boolean; periods: TaxPeriod[]; facts: TaxFact[]; pending_sources: TaxSource[];
 incoming_wht_total: number; input_vat_complete: false; outgoing_workflow_available: boolean;
 outgoing?: { id: string; payout_id: string; payee_name: string; gross_base: number; rate: number; withheld_amount: number; withheld_on: string; filing_status: string; remittance_status: string; remitted_amount: number }[];
 coverage: { invoice_items_without_approved_tax_point: number; unresolved_direct_sources: number }; history: unknown[] };
export function taxErrorKey(error: unknown) {
 const message = typeof error === "object" && error && "message" in error ? String(error.message) : "";
 if (/ADMIN_REQUIRED|PERMISSION_DENIED/.test(message)) return "taxPosition.error.permission";
 if (/SOURCE_CHANGED/.test(message)) return "taxPosition.error.changed";
 return "taxPosition.error.failed";
}
export function sourceLabel(source: Pick<TaxSource,"reference"|"source_id">) { return source.reference || source.source_id.slice(0,8).toUpperCase(); }
