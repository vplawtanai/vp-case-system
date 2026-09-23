import type { Expense } from "./shared";
import type { ExpenseRequest } from "./requests";
import { companyItemPaymentStatus, companyRequestPayment } from "./company-payment-status";

export const itemDecided = (item: Expense) => item.status === "accepted" || item.status === "rejected";
export function reviewProgress(items: Expense[]) {
 const approved = items.filter(i => i.status === "accepted").length;
 const rejected = items.filter(i => i.status === "rejected").length;
 return { total: items.length, reviewed: approved + rejected, approved, rejected,
  pending: items.filter(i => i.status === "submitted").length,
  draft: items.filter(i => i.status === "draft").length,
  paid: items.filter(i => companyItemPaymentStatus(i) === "paid").length,
  unpaid: items.filter(i => companyItemPaymentStatus(i) === "unpaid").length };
}
export function reviewItemLabel(item: Expense, claim: boolean) {
 if (item.status === "draft") return "draft";
 if (item.status === "submitted") return "claimPending";
 if (item.status === "rejected") return "requestRejected";
 const payment = companyItemPaymentStatus(item);
 if (payment) return claim ? payment === "paid" ? "claimRefunded" : "claimAwaitingRefund" : payment;
 if (item.obligation?.waived) return "waived";
 if (item.settlement?.mode === "no_reimbursement") return "notReimbursed";
 return claim ? "reviewClaimApproved" : "reviewCompanyApproved";
}
// List presentation only; KPI lanes, approval and payment rules remain unchanged.
export function companyReviewDisplayStage(request: ExpenseRequest) {
 if (request.status === "draft") return "draft";
 if (request.items.some(i => !itemDecided(i))) return "submitted";
 return companyRequestPayment(request).stage;
}
export function nextUndecided(items: Expense[], current: string) {
 const index = items.findIndex(i => i.id === current);
 return [...items.slice(index + 1), ...items.slice(0, index)].find(i => i.status === "submitted")?.id;
}
