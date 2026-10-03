import type { Expense, ExpenseAccount, ExpenseObligation } from "../expenses/shared";

export const BULK_LIMIT = 50;
export const eligiblePayable = (row: ExpenseObligation) => row.status === "open" && !row.settled && !row.waived && row.currency === "THB";
export type BulkEntry = { obligation: ExpenseObligation; row: Expense; accounts: ExpenseAccount[]; payoutId: string; accountId: string; paidOn: string; withhold: boolean };
export type BulkResult = { action: "prepare" | "confirm"; items: { obligation_id: string; payout_id: string; version: number; status: "draft" | "confirmed"; gross: number; wht: number; net: number }[] };
export function prepareItems(entries: BulkEntry[]) {
 return entries.map(e => {
  const a = e.accounts.find(a => a.id === e.accountId);
  if (!a?.can_record || !a.opening_as_of) throw new Error("account");
  return { obligation_id: e.obligation.id, payout_id: e.payoutId, expense_version: e.row.version, payout_version: e.row.payout?.status === "draft" ? e.row.payout.version : null,
   paid_on: e.paidOn, bank_account_id: a.bank_account_id, cash_location_id: a.cash_location_id,
   actual_wht: e.row.personally_paid ? false : e.row.tax_review?.request_json?.schema_version === 2 ? e.row.tax_review.wht_state === "withhold" : e.withhold, note: "" };
 });
}
export function confirmItems(entries: BulkEntry[]) {
 return entries.map(e => {
  const p = e.row.payout;
  if (p?.id !== e.payoutId || p.status !== "draft" || !p.can_confirm) throw new Error("changed");
  return { obligation_id: e.obligation.id, payout_id: p.id, payout_version: p.version, payee_version: p.payee_version, destination_id: p.bank_account_id ? p.destination?.id || null : null };
 });
}
export function validBatchResult(value: unknown, action: BulkResult["action"], entries: BulkEntry[]): value is BulkResult {
 if (!value || typeof value !== "object") return false;
 const result = value as BulkResult;
 return result.action === action && Array.isArray(result.items) && result.items.length === entries.length && new Set(result.items.map(i => i.payout_id)).size === entries.length && entries.every(e => result.items.some(i => i.obligation_id === e.obligation.id && i.payout_id === e.payoutId && i.status === (action === "prepare" ? "draft" : "confirmed") && Number.isInteger(i.version) && i.version > 0));
}
// A synchronous latch also covers clicks before React paints its disabled state.
export function submissionLatch() {
 let pending = false;
 return { enter: () => { if (pending) return false; pending = true; return true; }, leave: () => { pending = false; } };
}
