import { expenseWorkflowTime, workflowTimestamp } from "../workflow-time";
import { pendingExpenseTax, type Expense, type ExpenseAccess } from "./shared";
import type { ExpenseRequest } from "./requests";

export const hasReimbursement = (claim: boolean, items: { personally_paid?: unknown; reimbursement_requested?: unknown }[]) =>
 claim || items.some(item => item.personally_paid === true || Number(item.reimbursement_requested) > 0);

export function requestStage(request: ExpenseRequest) {
 if (request.status === "draft") return "draft";
 const items = request.items;
 if (!items.length || items.some(e => e.status === "submitted" || e.status === "draft")) return "submitted";
 if (items.every(e => e.status === "rejected")) return "rejected";
 if (items.every(e => e.payout?.status === "confirmed")) return "paid";
 if (items.some(e => e.status === "accepted" && e.obligation && !e.obligation.settled && !e.obligation.waived)) return "unpaid";
 return items.some(e => e.status === "rejected") ? "requestReviewedMixed" : "accepted";
}

export function requestNextAction(request: ExpenseRequest, access: ExpenseAccess) {
 const stage = requestStage(request);
 if (stage === "draft") return request.created_by === access.user_id || access.can_manage ? "nextSubmit" : "nextCreator";
 if (stage === "submitted") return access.can_manage ? "nextReview" : "nextWaitingReview";
 if (stage === "rejected") return "nextRejected";
 if (stage === "paid") return "nextPaid";
 if (stage === "unpaid") return "nextWaitingPayment";
 if (request.items.some(e => e.status === "accepted" && (pendingExpenseTax(e) || !e.settlement || e.settlement.mode === "undecided"))) return access.can_manage || access.can_tax_review ? "nextFinanceReview" : "nextFinanceProcessing";
 return "nextReviewed";
}

export function requestTimeline(request: ExpenseRequest) {
 const events: { key: string; label: string; at: string; item?: number }[] = [];
 const add = (key: string, label: string, at: string | null | undefined, item?: number) => {
  const timestamp = workflowTimestamp(at);
  if (timestamp) events.push({ key, label, at: timestamp, item });
 };
 add("created", "draftCreatedAt", request.created_at);
 add("submitted", request.kind === "employee_claim" ? "requestSubmittedAt" : "requestSentAt", request.submitted_at);
 request.items.forEach((e, index) => {
  for (const a of e.audit) {
   if (["accepted", "rejected", "payment_confirmed"].includes(a.event_type)) add(a.id, a.event_type, a.created_at, index + 1);
  }
  if (e.obligation) add(`obligation-${e.id}`, "readyToPayEvent", e.obligation.created_at, index + 1);
 });
 return events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function requestWaiting(request: ExpenseRequest, now: number) {
 const stage = requestStage(request);
 const times = stage === "submitted" ? request.items.filter(e => e.status === "submitted").map(e => expenseWorkflowTime(e, "submitted").at)
  : stage === "unpaid" ? request.items.filter(e => e.obligation && !e.obligation.settled && !e.obligation.waived).map(e => expenseWorkflowTime(e).at) : [];
 const known = times.filter((t): t is string => !!workflowTimestamp(t));
 if (!known.length || !Number.isFinite(now)) return null;
 return { label: stage === "submitted" ? "waitingReviewDays" : "waitingPaymentDays", days: Math.max(0, Math.floor((now - Math.min(...known.map(Date.parse))) / 86400000)) };
}

export function itemStage(item: Expense) {
 if (item.status !== "accepted") return item.status;
 if (item.payout?.status === "confirmed") return "paid";
 if (item.obligation?.waived) return "waived";
 if (item.settlement?.mode === "no_reimbursement") return "no_reimbursement";
 return item.obligation && !item.obligation.settled ? "unpaid" : "accepted";
}
