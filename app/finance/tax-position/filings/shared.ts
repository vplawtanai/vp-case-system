import type { Location } from "../../treasury/shared";
export type FilingType = "vat" | "wht_natural" | "wht_juristic";
export type FilingSource = { id: string; economic_key: string; fingerprint: string; base: number | null; amount: number; date: string; rate: number | null; reference: string; source_type: string; source_id: string; payee_name?: string; entity_type?: string; evidence: unknown };
export type FilingPool = { period_month: string; filing_type: FilingType; source_count: number; base_amount: number; tax_amount: number | null; output_vat: number | null; input_vat: null; input_vat_complete: false; ready: boolean; sources: FilingSource[]; review_sources?: FilingSource[]; issues: { code: string; count: number | null }[]; fingerprint: string };
export type Remittance = { id: string; filing_id: string; status: "draft" | "confirmed" | "cancelled"; version: number; amount: number; paid_on: string; external_reference: string; payment_evidence: string; bank_account_id: string | null; cash_location_id: string | null; draft_snapshot_json: { account: Location; amount_due: number }; confirmed_snapshot_json: unknown };
export type Filing = { id: string; period_month: string; filing_type: FilingType; status: "draft" | "ready_for_review" | "filed" | "cancelled"; version: number; due_date: string | null; due_date_evidence: string | null; tax_amount: number | null; base_amount: number; filed_on: string | null; external_reference: string | null; filing_evidence: string | null; source_snapshot_json: FilingPool; filed_snapshot_json: unknown; source_changed: boolean; remittance: Remittance | null; payment_history: Remittance[]; audit: unknown[] };
export type FilingHistory = Pick<Filing, "id" | "filing_type" | "period_month" | "status" | "tax_amount" | "filed_on" | "external_reference"> & { payment_state: string };
export type FilingData = { can_manage: boolean; can_remit: boolean; period_month: string; pools: FilingPool[]; filings: Filing[]; accounts: Location[]; incoming_wht_credit: number; history: FilingHistory[] };
export function activeFiling(data: FilingData, type: FilingType) { return data.filings.find(f => f.filing_type === type && f.status !== "cancelled"); }
export function filingState(filing: Filing | undefined, pool: FilingPool): string {
 if (filing?.status === "filed") return filing.tax_amount === 0 ? "no_payment_required" : filing.remittance?.status === "confirmed" ? "remitted" : "awaiting_payment";
 return filing?.source_changed ? "source_changed" : !pool.ready ? "needs_review" : filing?.status || "unprepared";
}
export function summarizeFilings(data: FilingData) {
 const vat = data.pools.find(p => p.filing_type === "vat"), wht = data.pools.filter(p => p.filing_type !== "vat");
 const outgoing = wht.every(p => p.ready) ? wht.reduce((n, p) => n + Math.round((p.tax_amount || 0) * 100), 0) / 100 : null;
 // Incoming WHT never participates in the obligation total.
 const total = vat?.ready && vat.tax_amount !== null && outgoing !== null ? Math.round((vat.tax_amount + outgoing) * 100) / 100 : null;
 const obligations = data.pools.filter(p => p.filing_type === "vat" || p.source_count > 0 || p.issues.length > 0 || activeFiling(data, p.filing_type));
 const complete = obligations.every(p => ["remitted", "no_payment_required"].includes(filingState(activeFiling(data, p.filing_type), p)));
 return { vat, outgoing, total, obligations, status: complete ? "complete" : obligations.some(p => !p.ready || activeFiling(data, p.filing_type)?.source_changed) ? "needs_review" : "collecting" };
}
export function filingErrorKey(error: unknown) {
 const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
 if (/PERMISSION_DENIED/.test(message)) return "permission";
 if (/SOURCE_CHANGED|ACCOUNT_CHANGED|STALE|IDEMPOTENCY_CONFLICT/.test(message)) return "changed";
 if (/ALREADY_EXISTS|DUPLICATE_COVERAGE/.test(message)) return "exists";
 if (/NOT_READY/.test(message)) return "notReady";
 if (/OPENING_BALANCE_REQUIRED/.test(message)) return "openingRequired";
 if (/BEFORE_CUTOVER/.test(message)) return "beforeCutoff";
 if (/EVIDENCE_REQUIRED|ACK_REQUIRED|INPUT_INVALID|DATE_INVALID|ACCOUNT_REQUIRED/.test(message)) return "required";
 return "failed";
}
