import { expenseQueueEntries, type ExpenseRequest } from "./requests";
import { requestTimeline } from "./request-operations";
import { pendingExpenseTax, type Expense, type ExpenseLookups } from "./shared";

export const companyRequests = (requests: ExpenseRequest[]) => requests.filter(r => r.kind === "company_expense_batch");
export const companyReviewComplete = (item: Expense) => item.status === "rejected" || (item.status === "accepted" && !pendingExpenseTax(item) && !!item.settlement && item.settlement.mode !== "undecided");
export function companyItemLane(item: Expense) {
 if (item.status === "draft") return "draft";
 if (item.status === "rejected") return "rejected";
 if (item.payout?.status === "confirmed") return "paid";
 if (!companyReviewComplete(item)) return "review";
 if ((item.obligation && !item.obligation.settled && !item.obligation.waived) || ["company_bank", "company_cash"].includes(item.settlement?.mode || "")) return "unpaid";
 return "accepted";
}
export function companySummary(requests: ExpenseRequest[]) {
 return (["review", "unpaid", "paid", "rejected"] as const).map(lane => {
  const matching = companyRequests(requests).map(r => r.items.filter(item => companyItemLane(item) === lane)).filter(items => items.length);
  return { lane, requests: matching.length, items: matching.reduce((n, items) => n + items.length, 0), amount: matching.flat().reduce((n, item) => n + Math.round(item.gross_amount * 100), 0) / 100 };
 });
}
export function companyQueue(requests: ExpenseRequest[], options: Parameters<typeof expenseQueueEntries>[2]) {
 const matching = companyRequests(requests).filter(r => options.status === "all" || (options.status === "tax" ? r.items.some(pendingExpenseTax) : r.items.some(item => companyItemLane(item) === options.status)));
 return expenseQueueEntries([], matching, { ...options, status: "all", claims: false });
}
export const companyTimeline = (request: ExpenseRequest) => requestTimeline(request).filter(e => request.status === "draft" || e.key !== "created");
export const companyProgress = (request: ExpenseRequest) => request.items.filter(companyReviewComplete).length;
export function companyPayee(row: Expense, lookups: ExpenseLookups) {
 const knownId = row.settlement?.payee_id || (!row.personally_paid ? row.supplier_payee_id : null);
 const matches = knownId ? lookups.payees.filter(p => p.id === knownId) : row.personally_paid && row.claimant_id ? lookups.payees.filter(p => p.profile_id === row.claimant_id) : [];
 return matches.length === 1 ? matches[0] : null;
}
export function noTaxReviewArgs(row: Expense, id: string, reason: string) {
 return { p_id: id, p_expense: row.id, p_previous: row.tax_review?.id || null, p_input: {
  vat_state: "none", vat_base: null, vat_rate: null, eligibility: "ineligible", supplier_tax_id: "", tax_document_reference: "", tax_document_date: row.expense_date,
  company_name_status: "unknown", wht_state: "none", wht_base: null, wht_rate: null, reason,
 } };
}
