import { claimWorkflowTime, expenseWorkflowTime, orderByWorkflow, type QueueOrder, type WorkflowTime } from "../workflow-time";
import { expenseCategoryLabel } from "./categories";
import { expensePaymentState, pendingExpenseTax, type Expense } from "./shared";

export type ExpenseRequest = {
 id: string; kind: "employee_claim" | "company_expense_batch"; status: "draft" | "submitted";
 version: number; note: string; created_by: string; created_at: string; submitted_at: string | null;
 requester_name: string; items: Expense[]; audit: { event_type: string; created_at: string; version: number }[];
};
export type RequestItemInput = { id: string; version: number | null; input: Record<string, unknown> };
export const requestReference = (id: string) => `REQ-${id.slice(0, 8).toUpperCase()}`;
export function requestTotals(items: Pick<Expense, "gross_amount" | "reimbursement_requested">[]) {
 const cents = (key: "gross_amount" | "reimbursement_requested") => items.reduce((n, e) => n + Math.round(e[key] * 100), 0) / 100;
 return { count: items.length, gross: cents("gross_amount"), requested: cents("reimbursement_requested") };
}
// Review progress only. The envelope never asserts payment/settlement completion.
export function requestProgress(request: ExpenseRequest) {
 if (request.status === "draft") return "draft";
 const accepted = request.items.filter(e => e.status === "accepted").length;
 const rejected = request.items.filter(e => e.status === "rejected").length;
 if (accepted + rejected === request.items.length) return rejected ? "requestReviewedMixed" : "requestReviewed";
 return accepted + rejected ? "requestPartial" : "submitted";
}
export function requestWorkflowTime(request: ExpenseRequest): WorkflowTime {
 return { event: request.status === "draft" ? "draftCreated" : request.kind === "employee_claim" ? "claimSubmitted" : "sentForReview", at: request.status === "draft" ? request.created_at : request.submitted_at };
}
export function matchesExpense(row: Expense, status: string) {
 return status === "all" || (status === "tax" ? pendingExpenseTax(row) : row.status === status || expensePaymentState(row) === status);
}
export type ExpenseQueueEntry = { id: string; time: WorkflowTime } & ({ expense: Expense; request?: never } | { request: ExpenseRequest; expense?: never });
export function expenseQueueEntries(rows: Expense[], requests: ExpenseRequest[], options: { claims: boolean; status: string; origin?: string; search: string; locale: "th" | "en"; order: QueueOrder; viewAll?: boolean }) {
 const { claims, status, origin = "all", search, locale, order, viewAll = true } = options;
 const text = (row: Expense) => [row.id, row.reference, row.description, row.category, expenseCategoryLabel(row.category, locale), row.vendor_name, viewAll ? row.claimant_name : ""].join(" ");
 const contains = (value: string) => value.toLowerCase().includes(search.toLowerCase());
 // Account-scoped readers may see one child but are not entitled to its siblings.
 const visibleRequests = new Set(requests.map(r => r.id));
 const entries: ExpenseQueueEntry[] = rows.filter(row => (!row.request_id || !visibleRequests.has(row.request_id)) && row.request_active !== false && matchesExpense(row, status) && (origin === "all" || origin === row.origin) && contains(text(row)))
  .map(expense => ({ id: expense.id, expense, time: claims ? claimWorkflowTime(expense) : expenseWorkflowTime(expense, status) }));
 for (const request of requests) {
  if (claims && request.kind !== "employee_claim") continue;
  if (origin !== "all" && origin !== (request.kind === "employee_claim" ? "employee_claim" : "company_purchase")) continue;
  if (!request.items.some(row => matchesExpense(row, status)) || !contains([requestReference(request.id), request.note, viewAll ? request.requester_name : "", ...request.items.map(text)].join(" "))) continue;
  entries.push({ id: request.id, request, time: requestWorkflowTime(request) });
 }
 return orderByWorkflow(entries, e => e.time.at, e => e.id, order);
}
