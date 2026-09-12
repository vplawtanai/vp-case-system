import { translate } from "../../../lib/i18n/catalog";
import type { UiLocale } from "../../../lib/i18n/core";

export const moneyCategories = ["unallocated", "company_revenue", "pass_through", "disbursement", "client_money", "other"] as const;
export type MoneyCategory = typeof moneyCategories[number];
export type MoneyChoice = { invoice_item_id: string; category: MoneyCategory; reason: string };
export type MoneyLine = {
  invoice_id: string; invoice_no: string; invoice_item_id: string; description: string;
  base: number; vat: number; settlement: number; cash: number; wht: number;
  vat_treatment: { treatment: string }; wht_evidence: { base_amount: number; rate_percent: number | null } | null;
};
export type MoneySource = {
  schema_version: 1;
  payment: { id: string; currency: string; status: string; cash: number; wht: number; settlement: number };
  lines: MoneyLine[]; proven_base: number; proven_vat: number; unallocated_settlement: number; blockers: string[];
};
export type MoneyAllocation = {
  id: string; payment_id: string; revision: number; version: number;
  status: "draft" | "reviewed" | "finalized" | "superseded";
  source_snapshot_json: MoneySource; decisions_json: MoneyChoice[]; note: string;
  created_at: string; reviewed_at: string | null; finalized_at: string | null; superseded_at: string | null; supersede_reason: string | null;
};
export type MoneyContext = {
  source: MoneySource; current: MoneyAllocation | null; source_current: boolean;
  can_manage: boolean; posting_enabled: false; eligible_for_future_policy_review: boolean;
  history: MoneyAllocation[];
  audit: { id: string; allocation_id: string; event_type: string; created_at: string; actor_id: string }[];
};
export function initialMoneyChoices(context: MoneyContext): MoneyChoice[] {
  // VAT/WHT/source descriptions do not establish the economic category.
  const saved = context.source_current ? context.current?.decisions_json : undefined;
  return context.source.lines.map(line => saved?.find(c => c.invoice_item_id === line.invoice_item_id)
    || { invoice_item_id: line.invoice_item_id, category: "unallocated", reason: "" });
}
export function moneyReviewComplete(source: MoneySource, choices: MoneyChoice[]) {
  return source.blockers.length === 0 && source.lines.length > 0 && source.lines.length === choices.length
    && source.lines.every(l => choices.filter(c => c.invoice_item_id === l.invoice_item_id).length === 1)
    && choices.every(c => moneyCategories.includes(c.category) && c.category !== "unallocated" && c.reason.trim().length > 0 && c.reason.length <= 2000);
}
export function moneyStatus(context: MoneyContext) {
  if (!context.current) return "unallocated";
  return context.current.status === "finalized" && context.source_current ? "finalized" : "reviewRequired";
}
export function moneyAllocationError(error: unknown, locale: UiLocale) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  const known = ["PERMISSION_DENIED", "STALE", "SOURCE_CHANGED", "SOURCE_UNPROVEN", "REVIEW_REQUIRED", "ACK_REQUIRED", "REASON_REQUIRED", "SUPERSEDE_REQUIRED", "HISTORY_IMMUTABLE"];
  const code = known.find(k => message.includes(`MONEY_ALLOCATION_${k}`));
  return translate(locale, `moneyAllocation.error.${code || "unknown"}`);
}
