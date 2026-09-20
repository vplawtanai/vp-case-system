import { pendingExpenseTax, type Expense, type ExpenseObligation } from "./expenses/shared";
import type { PayableGroup } from "./payables/shared";

export type QueueOrder = "newest" | "oldest";
type WorkflowExpense = Expense & { reviewed_at?: string | null };
export type WorkflowTime = { at: string | null; event: "draftCreated" | "claimSubmitted" | "sentForReview" | "reviewCompleted" | "taxQueue" | "readyToPay" | "paymentRecorded" | "settlementDecided" | "rightWaived" | "legacyEntered" };

export function workflowTimestamp(value: string | null | undefined): string | null {
 // A date without a timezone is not an authoritative lifecycle timestamp.
 return value && /T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}

export function compareWorkflowTimes(a: string | null | undefined, b: string | null | undefined, order: QueueOrder): number {
 const left = workflowTimestamp(a), right = workflowTimestamp(b);
 if (!left || !right) return left ? -1 : right ? 1 : 0;
 return (Date.parse(left) - Date.parse(right)) * (order === "oldest" ? 1 : -1);
}

export function orderByWorkflow<T>(rows: readonly T[], time: (row: T) => string | null | undefined, key: (row: T) => string, order: QueueOrder): T[] {
 return [...rows].sort((a, b) => compareWorkflowTimes(time(a), time(b), order) || key(a).localeCompare(key(b)));
}

function auditTime(row: Expense, event: string) {
 return orderByWorkflow(row.audit.filter(a => a.event_type === event), a => a.created_at, a => a.id, "oldest")[0]?.created_at;
}

export function claimWorkflowTime(row: Expense): WorkflowTime {
 if (row.status === "draft") return { event: "draftCreated", at: workflowTimestamp(row.created_at) };
 if (row.origin === "legacy_claim") return { event: "legacyEntered", at: workflowTimestamp(auditTime(row, "legacy_bridged")) };
 return { event: "claimSubmitted", at: workflowTimestamp(row.submitted_at) || workflowTimestamp(auditTime(row, "submitted")) };
}

function taxQueueTime(row: WorkflowExpense): string | null {
 const accepted = workflowTimestamp(row.reviewed_at) || workflowTimestamp(auditTime(row, "accepted"));
 if (!row.tax_review || row.tax_review.revision === 1) return accepted;
 // Revisions may leave and re-enter the pending queue. Never treat a pending-to-pending review as a new entry.
 const reviews = row.audit.filter(a => a.event_type === "tax_reviewed").map(a => a.evidence_json)
  .filter((v): v is Expense["tax_review"] & object => !!v && typeof v === "object" && "revision" in v);
 const byRevision = new Map(reviews.map(r => [r.revision, r]));
 byRevision.set(row.tax_review.revision, row.tax_review);
 let entered = workflowTimestamp(row.tax_review.reviewed_at);
 for (let revision = row.tax_review.revision - 1; revision >= 1; revision--) {
  const previous = byRevision.get(revision);
  // Non-Admin audit payloads are redacted. Missing history is unknown, not the latest update time.
  if (!previous || !["vat_state", "eligibility", "wht_state", "wht_exception"].every(k => k in previous)) return null;
  if (!pendingExpenseTax({ ...row, tax_review: previous })) return entered;
  entered = workflowTimestamp(previous.reviewed_at);
 }
 return accepted;
}

export function expenseWorkflowTime(row: WorkflowExpense, queue = "all"): WorkflowTime {
 const time = (event: WorkflowTime["event"], at: string | null | undefined): WorkflowTime => ({ event, at: workflowTimestamp(at) });
 if (queue === "submitted") {
  const submitted = claimWorkflowTime(row);
  return { ...submitted, event: submitted.event === "legacyEntered" ? "legacyEntered" : "sentForReview" };
 }
 if (queue === "tax" && row.status === "accepted" && pendingExpenseTax(row)) return time("taxQueue", taxQueueTime(row));
 if (row.payout?.status === "confirmed") return time("paymentRecorded", auditTime(row, "payment_confirmed"));
 if (row.obligation?.waived) return time("rightWaived", auditTime(row, "waived"));
 if (row.obligation && !row.obligation.settled) return time("readyToPay", row.obligation.created_at);
 if (row.settlement?.mode === "no_reimbursement") return time("settlementDecided", row.settlement.created_at || auditTime(row, "settlement_decided"));
 if (row.status === "draft") return time("draftCreated", row.created_at);
 if (row.status === "submitted") {
  const submitted = claimWorkflowTime(row);
  return { ...submitted, event: submitted.event === "legacyEntered" ? "legacyEntered" : "sentForReview" };
 }
 if (row.status === "accepted" && pendingExpenseTax(row)) return time("taxQueue", taxQueueTime(row));
 return time("reviewCompleted", row.reviewed_at || auditTime(row, row.status));
}

export function payableGroupTime(group: PayableGroup, order: QueueOrder) {
 return orderByWorkflow(group.components.filter(c => c.status === "open"), c => c.created_at, c => c.id, order)[0]?.created_at || null;
}

export function orderPayableGroups(groups: readonly PayableGroup[], order: QueueOrder): PayableGroup[] {
 const sorted = groups.map(g => ({ ...g, components: orderByWorkflow(g.components, c => c.created_at, c => c.id, order) }));
 return orderByWorkflow(sorted, g => payableGroupTime(g, order), g => `${g.recipient_id}:${g.currency}`, order);
}

type PayableQueueEntry = { key: string; at: string | null } & ({ source: "revenue_distribution"; group: PayableGroup } | { source: ExpenseObligation["source_type"]; rows: ExpenseObligation[] });
export function payableQueueEntries(revenue: readonly PayableGroup[], expenses: readonly ExpenseObligation[], order: QueueOrder): PayableQueueEntry[] {
 const entries: PayableQueueEntry[] = orderPayableGroups(revenue, order).map(group => ({ source: "revenue_distribution", key: `revenue:${group.recipient_id}:${group.currency}`, at: payableGroupTime(group, order), group }));
 const groups = new Map<string, ExpenseObligation[]>();
 for (const row of expenses) {
  const key = `${row.source_type}:${row.payee_id}:${row.currency}`;
  groups.set(key, [...(groups.get(key) || []), row]);
 }
 for (const [key, rows] of groups) {
  const sorted = orderByWorkflow(rows, r => r.created_at, r => r.id, order);
  entries.push({ key, source: sorted[0].source_type, rows: sorted, at: workflowTimestamp(sorted[0].created_at) });
 }
 // Keep source-family identities/payout paths separate, but do not bury new payees beneath a fixed family order.
 return orderByWorkflow(entries, e => e.at, e => e.key, order);
}
