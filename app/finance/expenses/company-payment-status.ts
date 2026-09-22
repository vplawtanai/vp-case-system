import type { Expense } from "./shared";
import type { ExpenseRequest } from "./requests";
import { requestStage } from "./request-operations";

// Supplier settlement is independent of the later tax-remittance workflow.
export function companyItemPaymentStatus(item: Expense): "paid" | "unpaid" | null {
 if (item.status !== "accepted" || item.obligation?.waived || item.settlement?.mode === "no_reimbursement") return null;
 if (item.payout?.status === "confirmed" || item.obligation?.settled) return "paid";
 if (item.obligation || ["company_bank", "company_cash"].includes(item.settlement?.mode || "")) return "unpaid";
 return null;
}
export function companyRequestPayment(request: ExpenseRequest) {
 const states = request.items.map(companyItemPaymentStatus);
 const paid = states.filter(s => s === "paid").length, unpaid = states.filter(s => s === "unpaid").length;
 const stage = request.status === "draft" ? "draft" : paid && unpaid ? "partiallyPaid" : paid ? "paid" : unpaid ? "unpaid" : requestStage(request);
 return { stage, paid, unpaid, total: paid + unpaid };
}
