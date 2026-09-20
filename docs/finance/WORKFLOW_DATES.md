# VP OS Business Date and Workflow Date

Business Date is when the real-world event happened. Expense dates remain the source for accounting, tax, matter costs and business history. Workflow Date is when an item entered a human-work queue. Review/approval/payable queues must not substitute business dates, old Draft creation dates, arbitrary updates, browser time or query time for lifecycle events.

Scope: the NEW `/finance/expenses`, `/finance/expenses/claims` and `/finance/payables` queues only. No Legacy route, data, calculation, permission, RPC or migration changes. Migration 056 is unnecessary: existing read RPCs expose the authoritative lifecycle times.

## Authoritative Sources

| Queue | Existing source | Presentation |
| --- | --- | --- |
| Draft | Immutable Expense `created_at` | Draft created, never Claim submitted |
| Claim/review submission | Expense `submitted_at`, set by `submit_finance_expense` using `clock_timestamp()`; submitted audit metadata if the field is missing | Claim submitted / Sent for review |
| Finance acceptance/rejection | Expense `reviewed_at`, set by `review_finance_expense`; matching audit event fallback | Reviewed |
| Initial tax-review wait after acceptance | Acceptance timestamp | Entered tax review |
| Tax-review re-entry | First pending revision following a completed revision, using append-only tax-review evidence | Entered tax review; pending-to-pending reviews do not reset the clock |
| Reimbursement/supplier obligation | `finance_expense_obligations.created_at`, atomically created by the settlement-decision RPC | Ready to pay |
| Revenue Distribution entitlement | Entitlement `created_at`, equal to source `materialized_at` by Migration 048 integrity guard | Ready to pay; NOT original distribution `finalized_at` |
| Confirmed Expense payment | Expense `payment_confirmed` audit-event timestamp | Payment confirmed; `paid_on` remains the business payment date |
| Noncash settlement/waiver | Settlement creation time / `waived` audit event | Settlement decided / Right waived |
| Explicitly bridged Legacy source in NEW workflow | `legacy_bridged` audit timestamp | Entered new workflow, not historical Claim submission |

Migrations 048, 051 and 055 retain their exact bytes. Their existing readers return all pages before client queue sorting and pagination. Retry behavior and immutable audit/event timestamps are unchanged. No additional table access or broader evidence grants are introduced.

## Independent Queues

Expense facts, tax and payment are independent axes. In the all-items view, confirmed payment, waiver, active obligation and noncash settlement take precedence; otherwise Draft/submission/acceptance/tax state selects the appropriate event. A submitted filter always uses submission time, even for an already-paid purchase still awaiting Finance review. A pending-tax filter on accepted records always uses tax-queue time, even if already paid. Draft/submitted rows shown by the existing broad tax filter retain truthful Draft/submission labels; they are not falsely described as having entered an actionable tax-review stage.

Claims default to latest submission first, with a separately labeled Draft creation date for Draft rows. Company queues default to newest entry in the selected queue. Payables default to newest active obligation/entitlement, both within recipient groups and across recipient groups. Source family, canonical recipient and currency remain distinct, preserving the existing payout paths. Groups are never merged by display name. The newest open item orders each group; the oldest-waiting option instead uses its oldest open item. Sorting does not change amounts, source identity, filters, category selection or modal state.

## Unknown History and Restricted Evidence

Missing/invalid timestamps sort after known timestamps in BOTH directions, with stable identity tie-breaks. Display: `ไม่พบเวลาที่เข้าคิว` / `Queue entry time unavailable`. No fake backfill.

Migration 055 intentionally redacts raw Expense audit payloads for non-Admins. Audit event names/timestamps, current tax review and Expense review fields remain readable. With no tax review, or only revision 1, the initial tax-queue start is acceptance. If revision 2+ is currently pending, proving continuous waiting versus re-entry requires prior review states. When those are redacted/missing, the queue timestamp remains unknown; neither the current revision time nor acceptance is silently substituted. Admin-visible complete history can establish the exact re-entry. This is a read-visibility limitation, not permission to expose raw evidence or add fabricated precision.

Distribution finalization remains visible in entitlement details, separately from materialization/readiness. No due date or source business date drives operational ordering.

## Rehearsal and Human UAT

Synthetic cases cover Sep 5 expense / Sep 15 Draft / Sep 20 submission; old expenses submitted after newer expenses; Sep 20 approval/obligation activation; Draft vs submission; entitlement finalization vs materialization; tax re-entry; unavailable history; and newest/oldest ordering across recipients. Fixtures exercise TH/EN, 390/768/1024/1440, filter/sort context, keyboard focus, and prohibit network writes.

After deployment, open the three queues without creating/submitting/approving/settling/paying anything. Check both business and workflow dates, newest/oldest options and source/status/search retention. Existing Production Payables, Direct Money, Treasury, Tax Position and Legacy data must remain untouched.
