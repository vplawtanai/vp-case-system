# Treasury / Cashbook Foundation (049)

Status: the business owner confirmed manual Production apply and post-apply
verification PASS, with empty failed checks, function differences and catalog
differences. Cash and opening rows remain zero. Repository finalization and UI
deployment are authorized; Production business writes, cutover and source
materialization are not authorized for the implementation agent.

## Existing architecture and reuse

- 025 provides `finance_cash_transactions`, cash audit, immutable opening
  evidence/audit, private integrity guards, RLS and an unknown-until-opening balance.
- 026 provides controlled manual cash and opening draft/confirm/cancel/revision RPCs.
- 027 atomically posts positive Payment cash after a confirmed opening cutoff,
  uses a currency advisory lock and retains pre-cutover Payment confirmation.
- 028/029 distinguish erroneous-record correction and settlement reallocation.
- 047 Direct Money freezes receipt facts but has only bank UUID or free-text cash
  location, and no atomic cash posting. Its non-revenue classifications are not
  accounting revenue. 048 materializes payables, not cash.
- Expense Claims' paid handler in `app/finance/expense-claims/page.tsx` writes the
  legacy company Ledger. It is unchanged. Future expense payment integration must
  define one stable expense-payment source leg and avoid duplicate legacy/manual
  postings; an approved claim alone is not cash movement.

## Accounts and currency

Existing `finance_bank_accounts.id` remains the bank identity. No bank master rows
are copied or altered. `finance_cash_locations` supplies physical IDs and seeds
one *master-data* row, Office Cash, not a money movement. Account keys are typed
`bank:<uuid>` / `cash:<uuid>`, never matched by display name.

Existing cash/opening tables gain nullable physical-location FKs and enforce
exactly one bank or physical destination. No duplicate cash/opening tables.
Treasury UI and its opening RPC are THB in this phase. Legacy cash/opening RPCs
retain their existing currency contracts; future multi-currency Treasury UI is
not claimed here. Bank deactivation does not remove its historical account row.

## Opening and balance

An opening is verified cash held immediately *before* the chosen Bangkok start
date: cutoff = prior day's 23:59:59.999999 Asia/Bangkok. Actual receipt dates are
stored at the end of their Bangkok day, preserving existing 027 semantics.

`system_balance = opening + confirmed inflows - confirmed outflows`, using SQL
numeric arithmetic, and only movements strictly after the current opening.
No confirmed opening means NULL/"Opening balance not set", never a
fabricated zero or bank-reconciled balance. Legacy Ledger is excluded.

Admin creates/saves an opening draft with account, start date, actual amount and
required evidence/reference note. The applied 049 RPC rejects blank notes, so the
UI retains this requirement despite the closeout request's optional-note wording;
it does not fabricate an evidence note or change the applied contract.
Confirmation requires the saved timestamp and
explicit verification that receipts from the start date onward are excluded.
Actor/time and audit are stored. Confirmed openings cannot be edited. A later
dated replacement atomically supersedes the previous opening and retains history.
Earlier cash remains immutable and is folded into the newly verified opening,
not counted a second time. An existing opening draft is resumed, not duplicated.

The old 027 opening RPC's unposted-Payment guard is unchanged. The new Admin-only
Treasury opening path intentionally permits outstanding historical sources,
because their individually acknowledged materialization is this phase's workflow.
Its stronger opening acknowledgement and visible pending-source list are required.
Balances include only posted movements, not unposted historical receipts. A date
on/before the opening cutoff is never eligible for historical materialization.

Human sanity checks:

1. "150,000 at KBANK and 20,000 in the office on go-live day" means two verified
   Opening Balances, not fake receipts, revenue, Payments or Ledger income.
2. "A client transfers 10,400 today" means the normal confirmed receipt source,
   one 10,400 cash inflow to its exact receiving account, not a manual duplicate.

## Source posting and immutability

Private `treasury_post_source` locks the source first, then the existing currency
cutover lock, then its opening. Positive confirmed cash posts one original source
leg. Payment retains its existing original unique index; Direct Money receives
its own original unique index. Account/source XOR checks, immutable cash lifecycle,
exact source amount/currency/destination, frozen source JSON and matching audit
are enforced. Retry returns the same row; stale expected evidence fails closed.

Only actual cash is posted. Incoming WHT remains a settlement credit. VAT already
inside cash creates no second leg. Direct client money, loans, partner funding,
other non-revenue money and business revenue all preserve their original source
classification metadata without Cashbook deciding revenue treatment.

Pending cash means a confirmed real-money receipt with no original Cashbook
inflow yet. It is independent of whether revenue distribution exists or is
finalized, and includes both Invoice-backed Payments and Direct Money, including
non-revenue money. The pending list is not a distribution-workflow queue.

For Direct Money 028430C3, the 10,400 actually received corresponds to one
10,400 inflow to KBANK, subject to the existing opening/cutover controls. Later
distribution divides economic rights into recipient payables, company share and
tax buckets; it does not receive the money again. Company share is not a second
Cash Transaction, VAT is not a separate inflow, and incoming WHT is not cash.
This example does not authorize materializing the Production source.

Future Payment confirmation uses its existing private cash hook. Future Direct
Money confirmation invokes a transactional status trigger. Failure rolls back
the original confirmation, its audit/snapshot and any cash insertion together.
No opening remains `pre_cutover_no_opening`; on/before cutoff remains pre-cutover;
zero Payment cash remains `not_required_zero_cash`. Missing identified location
fails closed once cutover exists. Historical superseded-opening gaps fail closed.

Direct Money forms select an explicit physical-location UUID. New confirmation
evidence freezes it; older frozen JSON is never refreshed/backfilled. A legacy
free-text physical receipt can be mapped only by an explicit Admin selection
during single-source materialization. That decision and original text are frozen
in Cashbook evidence; the source receipt is not edited. Payment destinations
remain their stored receiving-bank UUID: missing Payment destination is blocked,
not guessed as Office Cash or inferred from a method/name.

Historical materialization is one Admin RPC with source type/UUID, exact expected
source JSON and acknowledgement. There is no bulk action and no automatic backfill
in migration. Cash evidence freezes reference, payer, received date, cash/WHT,
currency, destination, original classification, opening, actor/time and source leg.
Technical JSON is collapsed; normal history shows human labels/references.

## Reversal and downstream boundary

Cash entries cannot be deleted, rewritten or truncated. Source reversal of a new
Treasury-linked original fails closed until a coordinated explicit cash correction
workflow exists. Existing generic Payment and Direct reversal semantics remain
for unposted sources; the legacy erroneous-Payment path remains unchanged for
pre-existing cash without this new evidence. Neither reversal nor reallocation
silently refunds money or deletes a Cashbook leg. Original-source classification
evidence is historical, not a live revenue categorization.

Future correction/refund needs a distinct explicit action, reason/authority,
original link, one append-only opposite leg, and deliberate effective-date policy.
Real refunds and erroneous-record corrections must not be conflated.

No Payout is implemented. Future Payout may settle several entitlements through
one bank transfer with separate entitlement allocations. Its cash leg is actual
transferred money, not gross rights or WHT withheld. Later tax remittance is a
different real outflow. Company share and payables create no cash entries.
No Ledger, Compensation, Revenue Allocation, tax/document creation or Expense
Claim integration is added. Existing upstream business functions are checked by
exact hashes in the operator artifacts except the explicitly changed cash hooks.

## Permissions, UI and rollout

Admin manages openings/materialization. Partner is read-only. Existing explicit
cash viewers retain only authorized bank access; physical read is Admin/Partner.
Source-materialization helpers remain private; only four controlled Treasury
RPCs and the RLS view helper are executable by authenticated users. No browser
cash/opening writes or new per-user permission grants are introduced.

`/finance/treasury` uses VP v1 account rows, then unposted-source review/history,
controlled opening modals, TH/EN, focused acknowledgements and closed technical
evidence. It shows "System balance", not actual bank reconciliation. Account rows
include authoritative bank names/numbers, currency and opening status. Following
human backend PASS, the permission-gated Treasury link is exposed immediately
after Payables and before Expense Claims, without moving Legacy modules.

Operator artifacts:

- `scripts/sql/preflight_treasury_cashbook_foundation.sql`: one SELECT/row; checks
  unused 049 namespace, exact predecessor functions, no cash cutover and protected
  financial evidence hashes. Mutable Ledger/Compensation counts are observability.
- `scripts/sql/dry_run_treasury_cashbook_foundation.sql`: exact embedded migration,
  baseline hashes, verifier and ROLLBACK; no business source RPC or cash row creation.
- `scripts/sql/verify_treasury_cashbook_foundation.sql`: one SELECT/row, named checks,
  exact catalog/function differences, RLS/privileges, no cutover, seeded identity
  and protected evidence hashes. Compare every pre/post hash on manual apply.

049 was prepared after applied 048, and has now been manually applied and verified.
The operator scripts above are retained evidence, not instructions to reapply 049.
Current UAT Direct Money 028430C3, Payment 95E22D0E, Invoice VP-IV-202609-000004,
Combined Draft D903B209, distributions and payables must remain untouched now.

Before later human historical-source UAT, choose and verify a start-day opening
that excludes those receipts and precedes their received dates. If the real go-live
opening already includes them, do not materialize them again or invent an earlier
balance just to make UAT pass. Production cutover/date selection is separate approval.

## Prepared files and local validation

All paths below are relative to `/Users/paolawyer/vp-case-app/vp-case-web`.
The following 23 files are intentional:

```text
app/finance/treasury/page.tsx
app/finance/treasury/shared.ts
app/finance/treasury/treasury.module.css
app/finance/direct-money/form.tsx
app/finance/direct-money/shared.ts
app/finance/payments/shared.ts
app/finance/finance-navigation.ts
app/finance/finance-navigation.test.ts
lib/i18n/catalog.ts
lib/i18n/messages/treasury.ts
supabase/migrations/202607180049_add_treasury_cashbook_foundation.sql
scripts/sql/preflight_treasury_cashbook_foundation.sql
scripts/sql/dry_run_treasury_cashbook_foundation.sql
scripts/sql/verify_treasury_cashbook_foundation.sql
scripts/tests/treasury-artifacts.cjs
scripts/tests/treasury-catalog.json
scripts/tests/treasury-postgres.test.cjs
scripts/tests/treasury-static.test.cjs
scripts/tests/treasury-browser.cjs
scripts/tests/direct-money-browser.cjs
scripts/tests/finance-navigation-browser.cjs
scripts/tests/payable-ui.test.cjs
docs/finance/TREASURY_CASHBOOK_FOUNDATION.md
```

Local validation passed:

- 90 focused UI/helper/static/navigation tests; no financial formulas changed.
- 48 isolated PostgreSQL test executions (including 12 Treasury cases and
  Direct Money/Payable regressions). PGlite PostgreSQL 17.5, no network/database
  credentials. Tests exercise the exact candidate, exact catalogs/function hashes,
  transaction failure injection, privileges/RLS, immutable history, idempotency,
  explicit mapping and the literal BEGIN/ROLLBACK operator artifact. This is not
  a live multi-session Production concurrency/load test.
- Closed-loopback actual React browser suites: TH/EN, 390/768/1024/1440, keyboard,
  modal focus restore, acknowledgement guards, read-only, exact source payload,
  raw evidence collapsed, no overflow, zero external requests. Direct Money
  additionally checks the explicit physical UUID and unchanged cash/tax payload.
- Targeted ESLint (zero warnings/errors), `npx tsc --noEmit`, `npm run build`,
  `git diff --check`, deterministic SQL regeneration and byte checks.
- All 75 tracked migration files and 25 unrelated untracked files are unchanged.

Applied artifact SHA-256 (unchanged from the prepared candidate):
`26472a525aefde2c0447ab3082e7dcc7215bd335c8d5febb6d971b56bcb8d0b2`.

Next human step after deployment: open Finance -> Treasury. Verify bank accounts
and Office Cash remain visible, each balance says "Opening balance not set", and
history says no cash movements. Inspect the opening dialog, then close without
saving. Send screenshots before choosing a real cutover date or opening amount.
Do not materialize Direct Money 028430C3 or Payment 95E22D0E yet.

## Cutoff and relationship audit (054 applied and verified)

Migration 049 defines a confirmed Opening as independently verified held money for
one bank/cash location and currency. Its start date is an account-specific boundary:
`as_of` is the end of the preceding Bangkok day. The balance view includes only
confirmed movements strictly after that cutoff. An Opening is not revenue.

`get_finance_treasury` historically returns all confirmed sources with no original
Cash row, without filtering the cutoff. `treasury_post_source` already rejects manual
posting on/before the cutoff (`FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER`), checks the
current Opening and superseded-opening gap, and preserves source/account/amount,
acknowledgement, authority, locks and idempotency. These functions remain unchanged.
The UI now classifies that read evidence using the same existing `sourceBlock` check:

- Eligible, post-cutoff sources only: actionable pending queue.
- Sources before the current start: historical disclosure, links but no posting action.
- Missing Opening/account or other blockers: separate review disclosure. Existing
  explicit legacy Direct Money location review remains available, not auto-posting.

With the supplied Sep-2026 evidence, all five Aug-27 through Sep-05 receipts
(31,409.81 THB) precede the Sep-10 KBANK start. They are historical, not five pending
actions. No records are removed or repaired, and KBANK Opening 0 is not reinterpreted.
Bypassing the cutoff could count held opening money twice; the unchanged RPC prohibits
it. Do not backfill these sources or treat their absence in Cashbook as permission.

The current operational panel shows only authoritative Cashbook stock:

- Current known STOCK: confirmed Openings 20,000 + inflows 29,560 - outflows 0 = 49,560.
  Components come from the authoritative balance view, never the paginated table.
  BAY/KTB unknown balances are excluded explicitly, not substituted with zero.
- Monthly source receipt totals are not shown alongside current stock. The five
  pre-cutoff receipts are collapsed after current movements and have no posting action.
  The actionable queue is empty when no source passes the existing cutoff checks.

The amounts above are acceptance evidence, not hard-coded production values. Migration
054 adds permission-checked, read-only `get_finance_treasury_month_flow` for complete
THB Payment/Direct Money monthly aggregates; confirmed status and existing location
visibility apply. It neither creates Cash nor depends on revenue distribution.
The consolidated operational page no longer calls that optional monthly-flow reader;
the applied RPC is unchanged. Current balances still use `get_finance_treasury`.
Economic rights/company share/VAT buckets do not create additional cash inflows.

The owner confirmed manual 054 verification PASS. Deployment is authorized, not
historical materialization, Opening changes or any other Production business writes.
