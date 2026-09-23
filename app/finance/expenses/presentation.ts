import type { ExpenseAccount } from "./shared";

export function expenseStatusTone(state: string) {
 if (["unpaid", "open", "claimAwaitingRefund"].includes(state)) return "payable";
 if (["accepted", "paid", "confirmed", "eligible", "none", "settled", "claimRefunded"].includes(state)) return "good";
 if (["rejected", "ineligible", "claimRejected"].includes(state)) return "bad";
 if (["review", "submitted", "pending", "undecided", "claimPending"].includes(state)) return "warn";
 return "info";
}

// Presentation of existing authority/opening facts only. RPCs remain authoritative.
export function expenseAccountIssue(account: ExpenseAccount) {
 if (!account.can_record) return "accountRecordDenied";
 if (!account.opening_as_of) return "accountOpeningMissing";
 if (!account.can_confirm) return "accountConfirmDenied";
 return null;
}
export const expenseAccountBlocked = (account: ExpenseAccount) => !account.can_record || !account.opening_as_of;
