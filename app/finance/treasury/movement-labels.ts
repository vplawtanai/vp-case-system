import type { CashMovement } from "./shared";
import { requestReference } from "../expenses/requests";

export type ExpenseMovementLabel = { key: "companyExpenseOutflow" | "claimOutflow"; description: string; recipient?: string; request?: string; requester?: string; client?: string; matter?: string; wht?: number; requestId?: string; requesterId?: string; clientId?: string; caseId?: number; matterId?: string };
export type FrozenExpensePayout = { id: string; status: string; source_model: string; confirmed_snapshot_json: unknown };
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;

// Financial facts and recipient come only from confirmed payout evidence. Names for linked IDs may be resolved under existing RLS.
export function frozenExpenseMovementLabel(row: CashMovement, payout?: FrozenExpensePayout): ExpenseMovementLabel | null {
 if (!row.source_payout_id || payout?.id !== row.source_payout_id || payout.status !== "confirmed" || payout.source_model !== "expense_v1") return null;
 const snapshot = object(payout.confirmed_snapshot_json);
 if (snapshot?.schema_version !== 2 || snapshot.source_model !== "expense_v1" || !Array.isArray(snapshot.choices) || snapshot.choices.length !== 1) return null;
 const choice = object(snapshot.choices[0]), expense = object(choice?.expense);
 if (!expense || !choice?.expense_id || expense.id !== choice.expense_id) return null;
 const key = expense.origin === "company_purchase" ? "companyExpenseOutflow" : expense.origin === "employee_claim" || expense.origin === "legacy_claim" ? "claimOutflow" : null;
 if (!key) return null;
 const requestId = text(expense.request_id);
 return { key, description: text(expense.description) || "", recipient: text(object(snapshot.payee)?.legal_name),
  requestId, request: requestId ? requestReference(requestId) : undefined, requesterId: text(expense.created_by),
  clientId: text(expense.client_id), caseId: typeof expense.case_id === "number" ? expense.case_id : undefined, matterId: text(expense.advisory_matter_id),
  wht: typeof snapshot.wht === "number" && Number.isFinite(snapshot.wht) ? snapshot.wht : undefined };
}
