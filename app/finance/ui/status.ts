export type FinanceTone = "neutral" | "info" | "success" | "warning" | "danger" | "transfer";
// Backend states and domain labels remain caller-owned. Unknown states are neutral.
export function financeStatusTone(status: string): FinanceTone {
  switch (status.toLowerCase()) {
    case "issued": case "confirmed": case "finalized": case "paid": case "fully_paid":
    case "settled": case "completed": case "signed": case "accepted": case "active":
    case "engagement_confirmed": case "reimbursed": case "invoiced": return "success";
    case "cancelled": case "canceled": case "voided": case "reversed": case "rejected":
    case "failed": case "overdue": return "danger";
    case "pending_allocation": case "pending_payment": case "partial_payment": case "pending": case "submitted": case "under_review": case "waiting_review":
    case "unclassified": case "unpaid": case "outstanding": case "partial":
    case "partially_settled": case "partially_paid": case "partially_reimbursed": case "awaiting_payment":
    case "awaiting_reimbursement": case "pending_evidence": case "due_soon": return "warning";
    case "approved": case "reviewed": case "ready": case "ready_to_pay":
    case "ready_to_invoice": case "reserved": case "sent": return "info";
    case "transfer": return "transfer";
    default: return "neutral";
  }
}
