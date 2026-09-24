# Revenue Distribution Phase 2 — candidate 068

Status: Production manual Preflight, rollback-only Dry-run, Apply and Post-Apply
Verifier completed successfully by the operator. Phase 2 is authorized for release.
No automated Production SQL/business writes, Human UAT or Phase 3 is included.

Repository: `/Users/paolawyer/vp-case-app/vp-case-web`, branch `main`, starting HEAD
`47bd273fdb47f8309005ed4c085eaad518108db8`. All 94 tracked applied migration files
(001–067) and all 28 pre-existing untracked files are preserved byte-for-byte.

## Existing contract and minimal extension

Migration 048 materializes immutable individual entitlement components after
finalization. Company shares are not entitlements. Migration 051 provides Payees,
Payouts, allocations, outgoing WHT obligations, paired Cashbook entries and audit.
055 routes expense-backed payouts separately; 063 preserves actual-outflow bank
reimbursement. The original distribution payout entry still required a saved draft,
explicit per-component WHT and a recipient destination for a bank source.

068 adds no table, column, policy, grant on a table, backfill or migration-time
business write. It extracts the unchanged 051 settlement body into the private
`payout_confirm_distribution_outflow` helper with an explicit entry-mode parameter.
`confirm_finance_payout_before_expense` delegates with strict legacy mode, preserving
its existing destination guard and snapshot shape. Only the new Admin entry uses
actual-outflow mode, which allows bank payment without a recipient bank profile.
All monetary arithmetic, canonical checks, cutover guards, audit, immutable-history
and confirmed-reversal restrictions remain in that shared engine.

New authenticated RPCs (both enforce active Admin in their body):

- `get_finance_distribution_payment_context(uuid,uuid)` — read canonical component,
  existing/virtual Payee and dynamically authorized Treasury accounts. No read writes.
- `pay_finance_distribution_participant(uuid,uuid,uuid,integer,date,uuid,uuid,text,numeric,text,boolean)`
  — derive and lock identities/amount, validate explicit WHT, save and confirm one
  full component atomically. A missing internal Payee is materialized via the
  existing deterministic identity RPC only inside the successful transaction.

`get_finance_revenue_distribution_detail(text,uuid)` also returns component IDs
and confirmed settlement/date/source evidence. No destination/Tax ID is exposed by
this detail projection. Existing detail read permissions remain unchanged.
All new functions pin owner postgres, SECURITY DEFINER and search_path public;
PUBLIC/anon/authenticated/service_role execution is revoked first. Only the two
Admin-checked public RPCs regain authenticated EXECUTE. Replaced functions preserve
existing ownership/ACL. No permission field or RLS changes.

## Outgoing WHT verdict

No authoritative outgoing default exists in Payee metadata. Entity type, Tax ID,
participant role and incoming customer WHT do not select an outgoing treatment.
The existing 051 contract already accepts the authorized user's explicit `none`
with rate 0, or `withhold` with a positive rate below 100 (up to four decimals).
The modal reuses that exception decision with no preselection, plus the existing
required Tax ID check for positive withholding. Missing information fails closed;
Payee corrections use the existing editor. No new Thai tax policy, historical-rate
inference or incoming-WHT reuse is introduced.

Thus all currently unresolved components require the explicit exception choice;
there is no invented automatic WHT path. The full entitlement is settled by
net cash plus explicit outgoing withholding, independent of later tax remittance.

## UI and queue boundary

Existing detail participant rows gain status, direct Pay and compact paid evidence.
Company rows show Company Share and no Pay action. Payment uses the existing
DetailModal; known recipient/role/amount are locked, source/date are selected,
reference/note remains optional, and one confirmation attests actual outflow.
The same request UUID survives transport retries; after a successful payment the
row becomes read-only and cannot initiate a duplicate payment.

General Payables no longer reads/renders distribution entitlements, and excludes
them from totals, recipient/item counts and filters. Company Purchase and Employee
Reimbursement reads, amounts, sorting, details and payment routes remain unchanged.
Internal entitlement storage and its old read RPC are preserved.

Existing 067 status derives from individual entitlement allocation coverage. Those
allocations are valid only for confirmed paired payouts under deferred integrity
constraints: no individual settled = unpaid; some = partial; all = paid. Company
shares never enter this denominator. No manual status flag or policy recalculation.

## Exactly-once and concurrency

Existing global `payout_lifecycle` advisory transaction lock is acquired before
source → distribution → entitlement → payout → Payee → Treasury cutover locks.
The existing canonical entitlement assertion runs under locks. Confirmation freezes
identity, actual company account/date, gross, explicit outgoing WHT and net cash.
Unique entitlement allocation, unique Cashbook source_payout_id, unique outgoing
WHT source_line_id and unique payout audit version enforce one settlement effect.
The atomic new RPC rejects altered request-ID retries and competing settled rights.
Any failure rolls back even newly materialized Payee/audit rows.

Local PostgreSQL 18 independent sessions (private disposable Unix socket, TCP
 disabled) tested simultaneous same-request retries and competing request IDs,
authenticated execution and positive outgoing WHT. Only one transaction can settle
a component; exactly one payout allocation, Cashbook movement and WHT obligation
are retained. This is an actual multi-session PostgreSQL test, separate from PGlite.
No Production concurrency experiment was performed.

## Static manual gates

Candidate SHA-256:
`3cffbbfbb1a554ef3e3eb9955f438b4f331d831b3209b44c27b796e30ce96e44`

Preflight is ready and SELECT-only. It verifies exact dependency function/catalog/
ACL contracts and target absence, pure v1/v2 reconstruction, candidate bytes, and
returns compact candidate/manifest/state/historical-row hashes. The contract traces
accepted 066 state and exact accepted 067 overlay, then compares definitions against
repository history. It scopes 74 functions, 52 relations and 105 protected row sets.
Broader 490 unresolved differences remain documented and are not silently accepted.

Dry-run and verifier are static, self-contained and pinned to the operator-approved
PASS hashes below. No JSON/CSV export, baseline file or direct database connection
is required. The reviewed SQL artifacts are preserved unchanged for release.

- Manifest: `5635a8a220628448ca9fd156d692b34bc7d13c8b6b796ce7d3d7cebb8451c464`.
- Baseline state: `4c9204bfb7ca94c39c79ce55d56348310fa60d7fb664c63994e6593790a35417`.
- Historical rows: `4ee66d9d5c5d6660dd5f0d3afef6b4f734aabf252e490a8e066d09ed6a1c7171`.

- Preflight: 70,188 bytes / 180 lines.
- Approved rollback-only Dry-run: 129,623 bytes / 206 lines.
- Approved Post-Apply Verifier: 56,183 bytes / 30 lines.

Dry-run locks protected business tables, recomputes approved scoped state, executes
exact candidate bytes within BEGIN, checks only the intended function delta plus
unchanged rows/catalog/ACL and v1/v2 policy, ROLLBACKs, and independently recaptures
the restored hash. Any SQL error is a failed gate. Verifier is SELECT-only and
normalizes only the independently verified intended function delta in memory before
checking the approved state hash and separate historical-row hash.

Operator-reported final verifier: gate_pass, exact_approved_baseline_matched,
historical_rows_unchanged and applied_state_exact are true; failed_checks and all
object/function/catalog differences are empty. Migration 068 must not be rerun.

Offline artifact validation (never executes SQL):
`node scripts/tests/distribution-payout-artifacts.cjs`

## Validation

- 8 targeted 068 PGlite scenarios: source parity, cash/bank, WHT unresolved/explicit,
  retry/conflict, permission/version/ack guards, audit-failure rollback, v1 evidence,
  unchanged Company/Reimbursement bank/cash paths and fail-closed static gates.
- 14 Migration 067, 14 Migration 066 and 7 payout foundation DB regressions pass.
- 116 targeted UI/formula/document/queue tests pass. Old test expectations for the
  already-released 067 navigation, Admin-only Finance menu visibility and extracted
  audit renderer were aligned with the existing implementation; production modules
  for those areas were not modified.
- Actual component browser smoke: TH/EN at 390/768/1024/1440; Payment/Direct,
  company exclusion, no default WHT, dynamic Treasury sources, missing Tax ID,
  double click, partial/paid status, readonly/Admin guards and no viewport overflow.
  Synthetic fixtures block every non-loopback request.
- Targeted ESLint, TypeScript, production build, artifact hashes and diff whitespace
  checks pass. The sandboxed build stalled; the authorized unsandboxed build passed.

Confirmed payout reversal stays unavailable, as in the current safe contract.
No Company Statement posting, Legacy writes, Phase 3, receipt renderer changes,
VAT duplication or incoming-WHT changes are included.

Release revalidation: 8 Phase 2 DB cases, 14 Phase 1 cases, 14 Migration 066
cases, 7 payout regressions and the independent-session PostgreSQL concurrency
case passed. All 74 selected UI/formula/document/queue checks and TH/EN browser
smoke at 390/768/1024/1440 passed, as did targeted ESLint, TypeScript, production
build, artifact validation and diff checks. DB suites ran in isolated synthetic
fixtures; the capture-only cases were skipped. No Production UAT was performed.

## Exact intended file manifest

- `app/finance/payables/multi-source.tsx`
- `app/finance/revenue-distribution/detail.tsx`
- `app/finance/revenue-distribution/participant-payment.tsx`
- `app/finance/revenue-distribution/shared.ts`
- `app/finance/revenue-distribution/workspace.module.css`
- `docs/revenue-distribution-068.md`
- `lib/i18n/messages/expenses.ts`
- `lib/i18n/messages/revenue-distribution.ts`
- `scripts/sql/dry_run_distribution_participant_payout_068.sql`
- `scripts/sql/preflight_distribution_participant_payout_068.sql`
- `scripts/sql/verify_distribution_participant_payout_068.sql`
- `scripts/tests/distribution-payout-approved-hashes.json`
- `scripts/tests/distribution-payout-artifacts.cjs`
- `scripts/tests/distribution-payout-browser.cjs`
- `scripts/tests/distribution-payout-concurrency.test.cjs`
- `scripts/tests/distribution-payout-contract.cjs`
- `scripts/tests/distribution-payout-contract.json`
- `scripts/tests/distribution-payout-fixture.json`
- `scripts/tests/distribution-payout-pg-adapter.cjs`
- `scripts/tests/distribution-payout-postgres.test.cjs`
- `scripts/tests/distribution-payout-ui.test.cjs`
- `scripts/tests/expense-foundation-ui.test.cjs`
- `scripts/tests/finance-expense-polish.test.cjs`
- `scripts/tests/finance-workflow-time.test.cjs`
- `scripts/tests/payout-ui.test.cjs`
- `supabase/migrations/202607180068_add_distribution_participant_payout.sql`
