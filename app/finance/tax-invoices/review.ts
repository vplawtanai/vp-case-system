import type { TaxDecisions, TaxInvoice } from "./shared";

export function taxDraftDirty(row: TaxInvoice, issueDate: string, decisions: TaxDecisions) {
  return issueDate !== row.issue_date || JSON.stringify(decisions) !== JSON.stringify(row.decisions_json);
}
export function taxIssueReady(input: {
  status: TaxInvoice["status"]; canIssue: boolean; busy: boolean; dirty: boolean; blockerCount: number;
  reviewed: boolean; acknowledged: boolean; logoReady: boolean; delayed: boolean; delayAcknowledged: boolean;
}) {
  return input.status === "draft" && input.canIssue && !input.busy && !input.dirty && input.blockerCount === 0
    && input.reviewed && input.acknowledged && input.logoReady && (!input.delayed || input.delayAcknowledged);
}
