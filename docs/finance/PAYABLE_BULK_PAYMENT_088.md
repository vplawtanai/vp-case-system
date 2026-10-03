# Payables bulk payment — 088 application release

Status: Migration 088 Human-applied and Post-Apply verification PASS, as confirmed
by the user. **088 is immutable and must not be regenerated or reapplied.**
The application release is authorized after targeted validation.
Repository: `/Users/paolawyer/vp-case-app/vp-case-web`, `main`.
Prepared against application commit `808417dd8eda42c61801eabfbdd5773de424be65`.

## Business and transaction contract

Bulk is a user action, not a combined payment. Explicitly selecting 200, 220 and
817.20 produces three payouts and three cash transactions/Statement lines.
`พร้อมจ่ายเมื่อ` remains ordering information. No oldest-first restriction.

One additive Admin-only RPC:
`finance_expense_payout_batch(p_action text, p_items jsonb, p_acknowledged boolean)`.
No table, column, existing RPC body, RLS policy or business-data change.
`prepare` creates/updates individual drafts; `confirm` is a separate transaction
requiring explicit acknowledgement of actual payments. Maximum 50 distinct items.

Prepare item:
`obligation_id, payout_id, expense_version, payout_version, paid_on,
bank_account_id, cash_location_id, actual_wht, note`.

Confirm item:
`obligation_id, payout_id, payout_version, payee_version, destination_id`.
For Office Cash, `destination_id` is null. Versions bind the read-back review.
Each item remains tied to exactly one existing expense obligation; Distribution
entitlements cannot enter this RPC.

The existing payout lifecycle advisory lock is acquired first, then all expense
locks in UUID order, then obligation/expense/payout rows in payout UUID order.
All expense locks precede the existing cash-cutover/account locks. Existing
`prepare_finance_expense_payout` and `confirm_finance_expense_payout` perform the
individual business checks and writes. Errors are rethrown with the failing item
identifier; the entire SQL statement rolls back, including previous items' cash,
WHT, allocation and audit inserts. Existing deferred integrity triggers remain.

Stable payout UUIDs and original versions provide retry identity using existing
records. An exact draft replay performs no write. A fully confirmed replay must
match the frozen version/payee/destination evidence and performs no write.
Changed retries and mixed draft/confirmed selections fail closed. Cancelling
remains the existing per-item draft action; confirmed payout reversal remains
unavailable. No Distribution consolidation behavior is reused.

## UI

Admin may select individual rows or all eligible visible rows; nothing is selected
automatically. The displayed selection total uses the existing payable gross
amount. Each selected item has its own account/date/WHT decision, and each
confirmed outflow retains its own net amount. Existing structured WHT decisions
are used as-is; legacy manual WHT input follows the existing individual UI.

The second step reloads the saved drafts and shows recipient, description, gross,
WHT, net cash, paying account and recipient destination where applicable. A
synchronous latch prevents repeated clicks. An uncertain network result retains
the original request for safe retry. A successful prepare followed by a failed
read is explicitly identified and reloads without another prepare. Drafts remain
available from the existing single-item flow if the dialog is closed. Existing draft notes are preserved when preparing through the bulk UI.

## Gate and baseline provenance

The dependency contract is reconciled against accepted 070/071 full-object pins,
accepted 078 additions/security, and immutable 055/060 source for two additional
dependencies. Synthetic fixture permissions are never authoritative. It covers individual payout functions,
permission and integrity helpers, and 16 payout/expense/cash/tax/account tables
(including columns, constraints, indexes, triggers, grants and RLS policies).
Preflight compares that expected contract to actual Production; unexpected drift
must be reviewed, not accepted by recapturing Production as the expected contract.

Every Finance business table plus profiles, numbering and audit evidence is
fingerprinted. All existing public table/security/view/function definitions and
default privileges are fingerprinted for preservation; only the new batch RPC is
excluded from the broad function preservation hash. This is **preservation, not
acceptance of unrelated historical Finance differences**. The corresponding flag
stays false. NOT NULL uses `pg_attribute.attnotnull`; PG18-only NOT NULL constraint
rows are excluded. Textual aggregation ordering uses `COLLATE "C"`.

The SELECT-only verifier is now bound to the exact Human-reviewed fresh Preflight
PASS values in `finance-payable-bulk-reviewed-baseline.json`:

- `rows_sha256`: `f729f91c43b25dc5103e267139444243fdc07cd34c6c1bca3813d7523e91ebff`
- `preserved_sha256`: `6762f93d45ac5ffa51633fbce5f72eb9ce1b3b907492036dfa5da7fcd308fb63`

Only the six verifier pin occurrences were replaced. Candidate, Preflight,
component contracts and business SQL remain unchanged. No fixture row hash was
used as a Production baseline. If business rows change between capture and apply/verify,
preservation must fail and the changed evidence must be reviewed; do not bypass it.

Candidate SHA-256:
`79ebc328357144bc11ce3884924fc9361f1889fe8609adc602c05062ff8828cd`

The following gate commands are retained as historical release evidence. The
Human Apply Gate has passed; do not rerun the migration for the application release.

Preflight (SELECT-only):

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_finance_payable_bulk_088.sql
```

Apply (only after Preflight review, baseline binding, and Human Apply approval):

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/supabase/migrations/202610030088_finance_payable_bulk_payment.sql
```

Post-Apply Verifier (only after reviewed baseline binding and Human Apply):

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/verify_finance_payable_bulk_088.sql
```

## Validation

- Isolated PostgreSQL 18, Unix socket only, no `.env`: 16 scenario groups pass,
  including one/multiple/non-oldest selections, exact N cash and Statement lines,
  different recipients/accounts, mixed WHT, cash/reimbursement, waiver/cancel/stale
  rejection, missing Opening Balance/cutoff, active Admin versus other roles,
  whole-batch rollback, exact retries and independent-session concurrency.
- Exact migration rollback/preservation and Preflight/Verifier fail/pass simulations;
  real table, NOT NULL, RLS, grants, function and business-row drift rejected.
- 35 targeted reconciliation/model/component/expense-UX/ordering tests pass.
  Existing UI tests require synthetic Supabase initialization values; they were
  run with a loopback URL and network disabled, without Production credentials.
- Closed local browser fixture: TH/EN, 1440px and 390px; individual/non-oldest/all
  and two-item selections, exact selection totals, prepare/confirm separation,
  N separate outflows, original single-item detail/prepare route, double-click
  protection, read-back failure recovery, non-Admin visibility; no page/dialog
  overflow or console/runtime errors.
- TypeScript, touched-file ESLint, production build and whitespace checks pass.
- All 117 pre-existing migration file hashes preserved. No Production connection,
  authority assignment, opening balance or financial transaction was performed.
- PG17 binary was unavailable locally; portable NOT NULL handling is covered by
  catalog tests on PG18 and the established `attnotnull` normalization.

## Intended files (22)

- `app/finance/payables/multi-source.tsx`
- `app/finance/payables/bulk-payment.tsx`
- `app/finance/payables/bulk-payment-model.ts`
- `app/finance/payables/bulk-payment-copy.ts`
- `app/finance/payables/bulk-payment.module.css`
- `supabase/migrations/202610030088_finance_payable_bulk_payment.sql`
- `scripts/sql/preflight_finance_payable_bulk_088.sql`
- `scripts/sql/verify_finance_payable_bulk_088.sql`
- `scripts/sql/diagnose_finance_payable_bulk_088_contract.sql`
- `scripts/tests/finance-payable-bulk-body.sql`
- `scripts/tests/finance-payable-bulk-artifacts.cjs`
- `scripts/tests/finance-payable-bulk-local-postgres.cjs`
- `scripts/tests/finance-payable-bulk-postgres.test.cjs`
- `scripts/tests/finance-payable-bulk.test.cjs`
- `scripts/tests/finance-payable-bulk-browser.cjs`
- `scripts/tests/finance-payable-bulk-fixture.cjs`
- `scripts/tests/finance-payable-bulk-reconcile.cjs`
- `scripts/tests/finance-payable-bulk-reconcile.test.cjs`
- `scripts/tests/fixtures/finance-payable-bulk-contract.json`
- `scripts/tests/fixtures/finance-payable-bulk-reviewed-baseline.json`
- `scripts/tests/fixtures/finance-payable-bulk-accepted-evidence.json`
- `docs/finance/PAYABLE_BULK_PAYMENT_088.md`

Release uses the established push-to-main Vercel Git integration. The release
response records the commit and READY deployment with matching Git SHA. Existing
individual and Distribution workflows remain unchanged. No Production payment,
test transaction, opening balance or other financial data mutation is part of
this application release.

Human UAT after deployment:

1. Select one non-oldest payable, then some/all eligible visible items; check the
   count and total in Thai/English on desktop/mobile.
2. Prepare selected payments, review each recipient, amount and paying account,
   and verify preparation remains separate from confirmation of actual payment.
3. When confirming actual payments, verify each selected payable has its own
   payout and separate Statement/Cashbook line; the existing single-item flow
   remains available.

## Repository reconciliation after failed 088 Preflight

The first candidate (`02010ab7…4487c`) used hashes exported from a synthetic
fixture. The Human-reviewed catalog-only diagnostic established that 10 function
and 12 table differences were accepted existing Production contracts, not drift.
The fixture lacked retained Supabase `service_role` grants; its extracted
`finance_bangkok_completed_day_end` definition also omitted the explicit 027
revocation from PUBLIC/anon/authenticated. No business row was implicated.

The reconciled candidate changes embedded dependency hashes only. Batch RPC body
SHA-256 remains `9a014515850a0bb9d3de8550d7787a0f207b46d1719f1af3b19039734bf3c7bb`;
the installed batch full-object pin remains
`aee9ff9bf8b59cc6458cb51a3a9ed81775c13804b2180c75023ae413a977bab4`.
Its business logic, locking, atomicity, item validation, grants and 1:1 cash
cardinality are unchanged. Migrations preceding 088 remain byte-for-byte pinned.

### Two source-derived dependency pins

| Function | Definition provenance | Exact security |
| --- | --- | --- |
| `expense_integrity()` | Created 055, replaced 059, final body 060 | owner postgres; PL/pgSQL trigger; SECURITY DEFINER; search_path=public; postgres/service_role EXECUTE; PUBLIC/anon/authenticated denied |
| `get_finance_expense_obligations(integer)` | Created 055, final body 060 (request recipient coalesce and LEFT JOIN payee) | owner postgres; PL/pgSQL STABLE; SECURITY DEFINER; search_path=public; postgres/service_role/authenticated EXECUTE; PUBLIC/anon denied |

CREATE OR REPLACE in 059/060 preserves the 055 owner/ACL. The 055 security block
revokes PUBLIC/anon/authenticated, restores authenticated only for its explicit RPC
list, and does not revoke service_role. Accepted pre-078 evidence for functions in
that same block supplies the exact retained ACL representation. Later 061–087
migrations do not replace these two functions or change their grants. The 078
permission helper changes are preserved independently; the obligations function
continues calling `expense_can_view_all()`.

The full-object pins reconstructed from that source are:

- expense_integrity: `4129c18337dbadea7e773f0cd31c13b4e2bfb08eaeb6c1bdfe91f2f106426e5e`
- get_finance_expense_obligations: `ba01495deb6bc9dd34763db5025b38e21ff6a8ca1c55063320a8ea4183a590a5`

These repository-derived expectations were confirmed by the subsequent
Human-reviewed fresh Production Preflight PASS. No actual Production contract
hash was copied as truth; only the reviewed preservation baselines were bound.

### Table grants and column ACLs

All 16 full table definitions are reconstructed and compared to the accepted 071
full-object hash, with the exact accepted 078 policy/trigger additions checked
separately. Accepted 078 security hashes are also checked wherever available.
This proves table ACLs, privilege results, columns, constraints, indexes, RLS and
existing triggers, rather than assuming the fixture's grants.

The 12 corrected tables are `finance_expenses`, `finance_expense_audit`,
`finance_expense_obligations`, `finance_expense_obligation_waivers`,
`finance_expense_settlements`, `finance_expense_tax_reviews`, `finance_payees`,
`finance_payee_destinations`, `finance_payouts`, `finance_payout_allocations`,
`finance_payout_audit`, and `finance_outgoing_wht_obligations`. Their accepted table
ACL retains full postgres/service_role privileges. Outgoing WHT additionally
retains authenticated SELECT from 050. No authenticated direct business-write
grant is introduced.

The diagnostic's `column_evidence_differences=[]` compared column structure,
**not column ACLs**. Absence of Production column ACL drift cannot be inferred
from that field alone. Migration history has no explicit column grants on these
dependencies. Reconciled full hashes include `attacl=null` for every column;
the fresh Preflight will reject any unexpected column ACL, including a redundant
grant. Local tests explicitly inject such a grant and verify failure. NOT NULL
is still checked through attnotnull, excluding PG18-only constraint rows.

### Reproducibility and fail-closed validation

`finance-payable-bulk-reconcile.cjs` validates every raw object against independent
accepted pins or immutable source. It cannot adopt altered definitions/grants
merely by recomputing the 088 hash. The new accepted-evidence fixture retains raw
components for review. The disposable test adapter installs these accepted ACLs
into its local fixture; the original unreconciled fixture fails the new Preflight.
The old automatic fixture-to-contract CAPTURE_088 path has been removed.

Targeted validation: 16 PostgreSQL scenario groups (rollback, N separate outflows,
WHT, old single-item flow, concurrency/retry, role/account guards, preservation,
function/body/grant/policy/column-ACL tampering, deterministic hashes), plus 13
reconciliation checks and 5 existing bulk UI/artifact checks. The subsequent
baseline-binding step ran only targeted static verifier consistency checks;
the verifier is bound and remains fail-closed for row/catalog/security drift.
No Production SQL, business data mutation, commit, push or deploy occurred.

Reconciliation files: candidate 088, its Preflight/Verifier, artifact generator,
contract fixture, accepted-evidence fixture, reconcile helper/test, disposable
fixture helper, targeted PostgreSQL test/runner and this document. The previous
diagnostic is retained unchanged as evidence of the rejected candidate.

Exact files changed during that reconciliation (before Human Apply):

- `supabase/migrations/202610030088_finance_payable_bulk_payment.sql`
- `scripts/sql/preflight_finance_payable_bulk_088.sql`
- `scripts/sql/verify_finance_payable_bulk_088.sql`
- `scripts/tests/fixtures/finance-payable-bulk-contract.json`
- `scripts/tests/fixtures/finance-payable-bulk-accepted-evidence.json` (new)
- `scripts/tests/finance-payable-bulk-artifacts.cjs`
- `scripts/tests/finance-payable-bulk-reconcile.cjs` (new)
- `scripts/tests/finance-payable-bulk-reconcile.test.cjs` (new)
- `scripts/tests/finance-payable-bulk-fixture.cjs` (new)
- `scripts/tests/finance-payable-bulk-local-postgres.cjs`
- `scripts/tests/finance-payable-bulk-postgres.test.cjs`
- `docs/finance/PAYABLE_BULK_PAYMENT_088.md`
