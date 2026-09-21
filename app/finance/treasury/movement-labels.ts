import type { CashMovement } from "./shared";

export type ExpenseMovementLabel = { key: "companyExpenseOutflow" | "claimOutflow"; description: string };
export type FrozenExpensePayout = { id: string; status: string; source_model: string; confirmed_snapshot_json: unknown };
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

// Labels use confirmed source evidence, never mutable expense descriptions or financial inference.
export function frozenExpenseMovementLabel(row: CashMovement, payout?: FrozenExpensePayout): ExpenseMovementLabel | null {
 if (!row.source_payout_id || payout?.id !== row.source_payout_id || payout.status !== "confirmed" || payout.source_model !== "expense_v1") return null;
 const snapshot = object(payout.confirmed_snapshot_json);
 if (snapshot?.schema_version !== 2 || snapshot.source_model !== "expense_v1" || !Array.isArray(snapshot.choices) || snapshot.choices.length !== 1) return null;
 const choice = object(snapshot.choices[0]), expense = object(choice?.expense);
 if (!expense || !choice?.expense_id || expense.id !== choice.expense_id || typeof expense.description !== "string" || !expense.description.trim()) return null;
 const key = expense.origin === "company_purchase" ? "companyExpenseOutflow" : expense.origin === "employee_claim" || expense.origin === "legacy_claim" ? "claimOutflow" : null;
 return key ? { key, description: expense.description } : null;
}
