# Multi-item Expense / Claim Requests

Baseline: `c32c5bcbac8b3c5dcc2c61b3d9eda47fb188ff6b`. Migration 056 is additive and requires a successful Production preflight before application. Local rehearsal is not evidence of Production application.

## Existing Contract Audit

Migration 055 already makes `finance_expenses` the individual business-fact authority. Draft facts may be edited; submission freezes facts; Finance accepts or rejects each item. Tax reviews and settlement decisions are separate append-only records. Only an accepted item's explicit settlement can create its unique obligation. Confirmed Payout, not acceptance, creates Cash and actual outgoing WHT. Existing rejected items have no return-to-Draft lifecycle; this phase does not invent one.

The deployed workflow-date helper distinguishes business dates from submission/review/ready-to-pay events. Payables continues to identify individual obligations and recipients. Legacy Claims, Tax Position, Treasury, Revenue Distribution and customer documents are outside this change.

## Parent / Child Boundary

- `finance_expense_requests`: creator, kind (`employee_claim` or `company_expense_batch`), Draft/submitted lifecycle, version, optional note, creation and submission timestamps.
- `finance_expense_request_items`: unique child membership, active position and retained removed-Draft history. One Expense cannot belong to two requests.
- `finance_expense_request_audit`: immutable versioned save/submit events, operation ID, actor, input evidence. One authoritative submission event per request.
- Children remain ordinary `finance_expenses`, each with its own business date, supplier/payer, category, amount, context, tax and settlement. No parent total, tax, payment or obligation is stored.

`REQ-<short UUID>` is only a display reference; full UUID identifies the request. No statutory document number is allocated. Item count, gross/requested totals and review-progress labels are derived. "Reviewed" never means paid or financially settled.

## Controlled Operations

`save_finance_expense_request` saves 1-100 Draft items atomically, checking existing claim/company entry permissions and each child's existing account-scoped permission where relevant. Owner/type, expected parent/child versions, distinct child IDs and exact operation-payload retry checks apply. It cannot adopt existing standalone records or another request's items. Removing an item retains its Expense and audit as inactive Draft history, without exposing it as a second standalone request.

`submit_finance_expense_request` locks the request, records one server timestamp, and submits all active children through the original item lifecycle. Child `submitted_at` equals the parent submission event; individual expense dates remain unchanged. Failure rolls back the entire submission. Retry does not restamp or submit twice.

Original save/submit/read functions are retained as private delegates. Public standalone save/submit rejects attached items, preventing partial request submission or independent editing. The existing explicit already-paid standalone RPC remains unchanged and idempotent. Batch Draft capture never invokes it or claims that a payment has been recorded.

Account IDs retained in the request's save evidence are entry-permission context only, not a payment instruction. The Draft creator can reload this context; every subsequent save rechecks existing account authority. It does not choose a settlement account or create Cash.

Raw new tables have RLS enabled and no browser grants. Scoped readers authorize the creator or existing Finance-wide readers. Private delegates are not executable by browser roles. Triggers preserve parent/membership/audit history. No new Finance, tax, Payee or account permissions are granted.

An account-scoped custodian who can read an assigned child but not the whole request still receives that individual Expense in the existing list. This exception never exposes sibling expenses, request notes or aggregate totals. Whole-request readers see one envelope instead of duplicate child rows.

## UI and Review

The existing Company Expense and Claim list launchers open a multi-item modal. One item editor is expanded at a time; completed summaries support edit, duplicate and remove. Claimant remains the authenticated user. Canonical 8/15 workflow category sets, Other text, optional Client/Case/Advisory disclosure, tax awareness and requested-reimbursement semantics remain in the shared form.

Draft save and request submission are separate explicit actions. The list stays behind the modal, retains filters, and shows one request row ordered by request submission time (or Draft creation time). Each child retains its original business date. Existing standalone records keep their original workflow-date sorting and remain individually readable, without fake grouping/backfill.

Request review expands one child at a time and reuses the existing Finance Review, tax and settlement controls. Three accepted items and one rejected item remain three independent eligible sources and one blocked source. A request does not approve or pay its total. Supplier A/B obligations stay distinct under the existing Payables recipient/source rules. No tax is inferred from category or request totals.

## Validation and Operator Package

Synthetic PostgreSQL tests cover the weekly four-item claim (300 + 120 + 450 + 1,000 = 1,870), original business dates, a single submission timestamp/event, partial review (870 accepted reimbursement), multiple suppliers and distinct VAT/WHT reviews, no Cash on approval, permission denial, stale versions, no adoption, duplicate prevention, retained removal history, forced-failure rollback, standalone paid-entry compatibility and exact catalog/functions.

Browser fixtures use real React components and handlers with local adapters, block external requests, and cover TH/EN at 390/768/1024/1440 with 1/3/10 items, local edit/duplicate/remove, unsaved-close warning, error/retry retention, one queue row and keyboard/focus. They do not claim Production UAT or multi-session database contention testing.

Run each focused database family in its own fresh process (`--test-name-pattern='^055'` and separately `--test-name-pattern='^056'`). Historical rollback rehearsals commit their synthetic baseline before testing migration rollback, so chaining later families in that same process contaminates fixture setup. The unrestricted combined run is not a reliable isolation boundary.

Operator sequence:

1. `scripts/sql/preflight_expense_request_foundation.sql`: one SELECT, named checks/differences and upstream evidence hashes. STOP unless `expense_request_foundation_preflight_pass=true`.
2. `scripts/sql/dry_run_expense_request_foundation.sql`: BEGIN, preflight gate, byte-exact embedded 056, verifier, ROLLBACK. No business fixture records or COMMIT. STOP on differences/failure.
3. Apply only `supabase/migrations/202607180056_add_expense_request_foundation.sql` after those gates pass.
4. `scripts/sql/verify_expense_request_foundation.sql`: exact catalog/functions/permissions, empty new foundation and unchanged rehearsal evidence. Compare the returned upstream hashes to preflight; do not turn mutable global counts into invariants.

Migrations 001-055 remain unchanged. No Legacy backfill, Production Request/Expense/Claim creation, approval, payment or other business mutation is part of deployment. Until 056 is installed, the UI recognizes only the specific missing-reader error and retains the old single-item modal; permission/network failures are not silently hidden.

## Human UAT

After confirmed 056 application and exact frontend deployment, first inspect both create modals without saving. In an explicitly authorized UAT fixture, assemble the weekly four-item Claim and verify 1,870 total and original dates. Save one Draft and submit once, then confirm one queue row sorted by submission time. Finance may then accept three items and reject the 1,000 item; verify only the accepted 870 can become reimbursement obligations. Separately inspect a multi-supplier Company request. Stop before Payout/Cash confirmation. These actions are human UAT, not deployment actions.
