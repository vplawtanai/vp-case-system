export type ExpenseAccess = { user_id: string; can_claim: boolean; can_manage: boolean; can_tax_review: boolean; can_view_all: boolean; can_view_accounts?: boolean; can_record: boolean; can_confirm: boolean; is_admin: boolean; creator_payment_fact_supported?: boolean };
export type CreatorPaymentFact = "unpaid" | "company_paid" | "personal_paid" | "unknown";
export type ExpenseAccount = { id: string; kind: "bank" | "cash"; name: string; bank_account_id: string | null; cash_location_id: string | null; balance: number | null; opening_as_of: string | null; can_view_balance: boolean; can_view_movements: boolean; can_record: boolean; can_confirm: boolean };
export type ExpenseTax = { id: string; revision: number; vat_state: "none" | "exists" | "pending"; vat_base: number | null; vat_rate: number | null; vat_amount: number | null; eligibility: "eligible" | "ineligible" | "pending"; supplier_tax_id: string | null; tax_document_reference: string | null; tax_document_date: string | null; company_name_status: "yes" | "no" | "unknown"; wht_state: "none" | "withhold" | "pending"; wht_base: number | null; wht_rate: number | null; wht_amount: number | null; wht_exception: boolean; reason: string; reviewed_at: string };
export type SettlementMode = "undecided" | "company_bank" | "company_cash" | "supplier_unpaid" | "reimburse" | "no_reimbursement";
export type ExpenseSettlement = { id: string; mode: SettlementMode; payee_id: string | null; amount: number; reason: string; created_at?: string | null };
export type ExpenseObligation = { id: string; expense_id: string; source_type: "employee_reimbursement" | "supplier_payable"; payee_id: string; gross_amount: number; currency: string; due_on: string | null; created_at: string; payee_name: string; description: string; reference: string; status: "open" | "settled" | "waived"; settled?: boolean; waived?: boolean; payout_id: string | null };
export type ExpensePayout = { id: string; status: "draft" | "confirmed" | "cancelled"; version: number; paid_on: string; gross: number; wht: number; net: number; bank_account_id: string | null; cash_location_id: string | null; payee_id: string | null; payee_version: number | null; can_confirm: boolean; can_cancel: boolean; destination: { id: string; bank_name: string; account_name: string; account_number: string } | null };
export type Expense = { id: string; reference: string; origin: "company_purchase" | "employee_claim" | "legacy_claim"; legacy_claim_id: string | null; status: "draft" | "submitted" | "accepted" | "rejected"; version: number; expense_date: string; description: string; category: string; vendor_name: string | null; supplier_payee_id: string | null; claimant_id: string | null; claimant_name: string | null; client_id: string | null; case_id: number | null; advisory_matter_id: string | null; gross_amount: number; currency: string; creator_payment_fact?: CreatorPaymentFact | null; personally_paid: boolean; reimbursement_requested: number; vat_awareness: string; wht_awareness: string; note: string; created_by: string; submitted_at: string | null; review_reason: string | null; created_at: string; tax_review: ExpenseTax | null; settlement: ExpenseSettlement | null; obligation: ExpenseObligation | null; payout: ExpensePayout | null; audit: { id: string; event_type: string; actor_name: string; created_at: string; evidence_json: unknown }[]; request_id?: string | null; request_active?: boolean | null; request_entry_account?: { bank_account_id: string | null; cash_location_id: string | null } | null };
export type ExpenseData = { access: ExpenseAccess; accounts: ExpenseAccount[]; rows: Expense[]; record?: Expense; has_next: boolean; requests?: import("./requests").ExpenseRequest[] };
export type ExpenseLookups = { clients: { id: string; name: string }[]; cases: { id: number; client_id: string | null; file_no: string; title: string }[]; matters: { id: string; client_id: string | null; matter_no: string; title: string }[]; payees: { id: string; legal_name: string; profile_id: string | null }[]; people: { id: string; name: string }[] };
export const emptyLookups: ExpenseLookups = { clients: [], cases: [], matters: [], payees: [], people: [] };
export const expenseHref = (row: Pick<Expense, "id" | "origin">) => `/finance/expenses/${row.origin === "company_purchase" ? "" : "claims/"}${row.id}`;
export const expenseShortRef = (id: string) => `EXP-${id.slice(0, 8).toUpperCase()}`;
export function expensePaymentState(row: Expense) {
 if (row.payout?.status === "confirmed") return "paid";
 if (row.obligation?.waived) return "waived";
 if (row.settlement?.mode === "no_reimbursement") return "no_reimbursement";
 if (row.obligation) return "unpaid";
 return row.settlement?.mode || "undecided";
}
export const pendingExpenseTax = (row: Expense) => row.status !== "rejected" && (!row.tax_review || row.tax_review.vat_state === "pending" || row.tax_review.eligibility === "pending" || row.tax_review.wht_state === "pending" || row.tax_review.wht_exception);
export function expenseSummary(rows: Expense[]) {
 const group = (test: (row: Expense) => boolean, amount = (row: Expense) => row.gross_amount) => { const selected = rows.filter(test); return { count: selected.length, amount: selected.reduce((sum, e) => sum + Math.round(amount(e) * 100), 0) / 100 }; };
 return { review: group(e => e.status === "submitted"), unpaid: group(e => !!e.obligation && !e.obligation.settled && !e.obligation.waived, e => e.obligation!.gross_amount), paid: group(e => e.payout?.status === "confirmed", e => e.payout!.gross), tax: group(pendingExpenseTax) };
}
export function expenseError(error: unknown) {
 const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
 if (/PERMISSION|ACCOUNT_DENIED|ADMIN_REQUIRED/.test(message)) return "denied";
 if (/STALE|SOURCE_CHANGED|ALREADY_DECIDED|DRAFT_EXISTS|IDEMPOTENCY/.test(message)) return "stale";
 if (/OPENING_BALANCE_REQUIRED|BEFORE_CUTOVER/.test(message)) return "cutoff";
 if (/DESTINATION_REQUIRED|PAYEE_INVALID|TAX_ID_REQUIRED/.test(message)) return "payeeIncomplete";
 if (/WHT_ACTUAL/.test(message)) return "whtException";
 if (/BRIDGE_INELIGIBLE|BRIDGED/.test(message)) return "bridgeBlocked";
 return "failed";
}
