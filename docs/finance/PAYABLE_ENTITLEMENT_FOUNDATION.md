# Payable Entitlement Foundation (Migration 048)

Status: the business owner confirmed manual Production apply and post-apply PASS:
`payable_entitlement_foundation_verification_pass=true`; failed checks, catalog,
prerequisite and function differences are empty. Repository finalization and UI
deployment are authorized. No Production business write or materialization is
authorized for the implementation agent. Applied migrations 001-047 are unchanged.

Migration 048 retains the exact prepared bytes, SHA-256:
`a4aad44a540cc251889574702d64654faed331e4b788672e619dcfcd378110f4`.
Human-reported foundation state: entitlement/source/audit rows are all zero;
Cash and Opening Balances are zero; two finalized distributions remain untouched.
Legacy Ledger 317 and Compensation 129 are observations, not fixed invariants.

## Source and Recipient Audit

- 045 introduced `finance_vp_revenue_distributions` and
  `finance_vp_revenue_distribution_audit`. One current revision per received-money
  source; revision chains use `previous_id`. Optimistic `version` advances on
  save/review/finalize/supersede. Finalized evidence is `to_jsonb(distribution)` in
  the finalized audit event, containing `source_snapshot_json`, `decisions_json`,
  revision/version and actor/timestamps. It is not a live formula result.
- 046 stores canonical `formula_result` per source line: formula code/version,
  frozen definition, calculation policy, recipient components, component numbers,
  role/bucket, identity and exact amount. The existing calculator verifies that
  the entire result reconciles. New evidence verifies active user identities.
- 047 extends the same distribution lifecycle to Direct Money. Payment-backed
  source-line identity is `invoice_item_id`; Direct Money uses `source_line_id`.
  The source itself retains its received-money version/fingerprint and evidence.
  `vp_received_frozen` and `vp_distribution_choices` validate frozen evidence
  without consulting the live formula catalog. Source-first locking is already
  implemented by `vp_received_lock` and the existing transition RPC.
- Canonical staff identity is `user_profiles.id`, stored as
  `recipient_kind=user` / `recipient_user_id`. Names come from the frozen formula,
  not a later staff profile. A person can occupy multiple roles without becoming
  multiple people. A later inactive/renamed profile does not erase historical rights.
- External recipients in 046 and legacy Compensation have a display name and
  `recipient_user_id=null`, not a canonical external-person ID. A Compensation
  allocation ID identifies an allocation, not an external person. No safe
  cross-role external grouping exists today. Candidate 048 explicitly rejects
  positive external components with `PAYABLE_CANONICAL_RECIPIENT_REQUIRED`.
  It never invents an identity, matches names, or edits historical evidence.
  Future finalization with such components rolls back in full; historical
  materialization also fails without partial rights. Canonical external-recipient
  support requires a separately approved identity/evidence extension.
- Aggregate-only 045 history lacks recipient components. It stays readable and
  supersedable but cannot be materialized. A formula is never guessed retroactively.
- Existing `current_user_can_view_finance_payments()` preserves active
  Admin/Partner and explicitly delegated Finance read policy. `money_allocation_admin()`
  is the active-Admin mutation gate. No new staff permissions or own-rights policy.
- Legacy `/finance/compensation` manually writes
  `finance_compensation_batches` / `finance_compensation_allocations`, stores
  nullable staff IDs and names, and has its own paid/company-Ledger posting actions.
  It is neither a canonical external-person registry nor a safe automatic payout
  adapter. No reuse of those write paths or changes to its navigation/data.
- Expense Claims has claimant IDs, approval and a distinct pay flag/action, and
  writes a legacy Ledger entry when marked paid. Those reimbursement/payment
  semantics are not recipient entitlements and are not invoked here.
- Cash Transactions/Opening Balances (025-028) are actual movement/cutover
  domains. A right is not cash movement. Legacy Ledger remains operational;
  its row count, as well as Compensation counts, is observability only.

## Domain and Immutable Evidence

Three tables:

1. `finance_payable_entitlement_sources`: one materialization per distribution;
   freezes the full finalized distribution and canonical component manifest.
   This also records a legitimate zero-component/company-only materialization.
2. `finance_payable_entitlements`: one positive referral/work component per row.
   Carries source kind/UUID, line UUID, formula code/version/component number,
   recipient UUID/type/frozen name, role, currency, gross right, finalized date,
   immutable line/formula/recipient evidence and distribution revision/version/hash.
3. `finance_payable_entitlement_audit`: append-only materialized/superseded events,
   actor/time and complete frozen distribution/component evidence. Unique event
   per distribution prevents duplicate materialization audit on retries.

Business key: distribution UUID (already unique to source revision) + source line
UUID + component key. Component key hashes the frozen line, formula code/version,
canonical component number, recipient kind/UUID, role and bucket. The component
number belongs to an immutable, recalculated 046 result; it is not an index in a
live UI list. Neither amount nor display name is the identity. The full finalized
distribution JSON has a separate MD5 equality fingerprint, not a signature or
authorization token. Full evidence, not just its hash, is checked for equality.

Deferred integrity enforces complete exact component sets, frozen finalized audit
evidence, typed column equality, source status and required entitlement audit.
Old audit JSON missing a later nullable distribution column is compared through
the current composite row type; original audit bytes are not rewritten.

Company components are skipped, not represented as payables. VAT and incoming WHT
are not recipient components. Zero-value components do not create rights.
No `paid`, `partially_paid`, payout amount or outgoing tax fields are fabricated.
Statuses are only `open` and `superseded`.

## Atomic Lifecycle and Historical Operation

New AFTER UPDATE hook on reviewed -> finalized calls a private materializer
inside the existing transaction. Existing finalize RPC/signature and guards are
unchanged. Entitlements, materialization and audit all succeed or finalization
rolls back. A deferred finalization guard also checks completeness.

Historical entry: `ensure_finance_payable_entitlements(distribution_id,
expected_version, acknowledged)`. Active Admin only; one explicit finalized
distribution, source-first lock then row lock, exact optimistic version,
frozen-only computation. It returns the same distribution UUID on idempotent
retry. No operation in migration/preflight/rehearsal/verifier performs this action.

Superseding an old finalized source without materialization remains possible.
For a materialized source, all open rights are marked superseded with the source
timestamp and one append-only audit event. Nothing is deleted or recalculated.
The full frozen right remains visible in historical UI.

`payable_assert_unpaid_contract` rejects source invalidation if any future FK
references an entitlement. This deliberately fails closed even before the first
payout under that future schema. A payout migration must explicitly replace this
guard with coordinated, locked effective-settlement validation. An unregistered
text/JSON-only payout linkage is NOT a supported integration contract.

## Human Totals and Tax Boundary

Synthetic fixture only, not a Production write:

| Recipient | Components | Gross right |
|---|---|---:|
| Pam | Referral 1,940 + Co-working Counsel 1,164 | 3,104 |
| Tangmo | Lead Counsel 1,940 | 1,940 |
| Pao | Quality Control 776 | 776 |
| Total | Four components | 5,820 |

Pool is 9,700; company 3,880 is excluded. VAT 700 and incoming WHT 300 are excluded.
The existing formula has already deducted incoming WHT from the professional
base. Candidate 048 copies each gross recipient right; it performs no additional
withholding. An outgoing withholding event, if applicable on a future payout,
is a separate decision, tax evidence and calculation.

## Future Payout Contract (Not Implemented)

One canonical recipient and currency, one or many eligible component IDs,
one real transfer -> one payout ID with an idempotency/request key -> immutable
allocations of gross right/outgoing tax/net transfer -> exactly one Cashbook
outflow keyed by that payout ID. Amount/name/bank reference alone cannot be the
idempotent payout identity. Partial settlement may be added later with exact
cent conservation, effective-allocation uniqueness and no overpayment.

Lock received sources in deterministic order, then distribution/entitlement rows,
then payout/allocations. Recheck open rights and effective settlement inside that
transaction. Coordinated correction/reversal is append-only; never reopen a
settled source through today's unpaid supersession path. Company share is not a
payout. Outgoing WHT is not an additional cash leg. Bank/Cashbook and later Ledger
integration remain separate from this rights-only foundation.

Legacy Compensation should move toward historical/pending/paid compatibility
without re-entering formula results, but no compatibility write, dedupe/backfill,
batch or posting is introduced now. Future own-entitlement visibility must
restrict canonical recipient IDs at the backend and avoid leaking other people,
formula/company margin, or full source snapshots. Current shared Finance access
does not imply such an own-only audience.

## Payables UI and Delivery Gate

`/finance/payables`, TH รายการรอจ่าย / EN Payables. VP UI v1 PageShell/Header,
FilterToolbar/FieldGroup, StatusBadge, SourceBadge, MoneySummary, ReadOnlyGrid,
Disclosure, Callout and EmptyState. Recipient + currency grouping, 25 complete
groups per page; server sums exact numeric amounts in one stable read statement.
Totals explicitly apply to current source/bucket/status filters. Search uses
frozen names/UUIDs but never changes grouping identity. Different frozen names
for one person are visible on each component; group title uses newest evidence.

Component details retain role, bucket, source link, line description, amount,
finalized date, distribution reference/version, formula/component and collapsed
technical evidence. No Pay button, disabled payout placeholder or create-entitlement
entry on this list. Native disclosures and selects retain keyboard behavior.

The existing finalized Distribution panel offers the explicit Admin historical
materialization action, with acknowledgment, localized errors, synchronous
double-submit lock and status reload before retrying an uncertain response.
Partner sees a read-only message/link. Existing finalize/supersede surfaces also
show new identity/legacy-evidence/payout-guard errors in TH/EN.

Navigation is near Expense Claims / Lawyer Compensation. Compensation remains.
The backend verification gate has passed, so deployment can expose Payables.
The initial page is a neutral zero-state, not an error. Neither page load nor
deployment materializes either existing finalized distribution.

## Operator Workflow

The schema workflow below is retained evidence, not an instruction to reapply
Migration 048. Manual apply and post-apply verification have passed. After the
authorized frontend deployment, human UAT may inspect Payables, then explicitly
materialize the finalized distribution behind 028430C3 and verify four rights,
three recipient groups and 5,820 THB. No payout action exists in this phase.

All SQL artifacts are generated by `scripts/tests/payable-artifacts.cjs` using the
local PostgreSQL catalog manifest and exact function body/contracts. Preflight
and verifier each return one row: named checks, failed checks, exact catalog /
function differences, protected upstream row-set hashes and informational counts.
No fixed mutable Ledger/Compensation count invariant. Compare all protected
hashes before/after apply; the standalone verifier cannot reconstruct an earlier
Production baseline without that operator comparison. Rehearsal stores the
baseline transaction-locally and verifies it automatically, then ROLLBACK.

1. Human runs only `scripts/sql/preflight_payable_entitlement_foundation.sql` first.
2. Review PASS and save evidence. Separately authorize/run rollback-only
   `scripts/sql/dry_run_payable_entitlement_foundation.sql`; no business fixtures.
3. Only after approval, manually apply unchanged candidate
   `supabase/migrations/202607180048_add_payable_entitlement_foundation.sql`.
4. Run `scripts/sql/verify_payable_entitlement_foundation.sql`; require PASS,
   exact manifest and three new tables empty; compare upstream hashes.
5. Separate finalization request: tests, intended commit/push/deploy only after
   manual apply + verifier PASS. Then human UAT may explicitly materialize the
   distribution behind 028430C3. Expected four components/three people/5,820.

No Production operation, bulk backfill, cash movement, document issue, compensation
posting or protected UAT action is part of preparation. Local tests use synthetic
IDs and isolated in-memory PostgreSQL with no credentials or network.

## Prepared File Inventory

New files (17):

- `app/finance/payables/materialize-action.tsx`
- `app/finance/payables/page.tsx`
- `app/finance/payables/payables.module.css`
- `app/finance/payables/shared.ts`
- `lib/i18n/messages/payables.ts`
- `docs/finance/PAYABLE_ENTITLEMENT_FOUNDATION.md`
- `supabase/migrations/202607180048_add_payable_entitlement_foundation.sql`
- `scripts/sql/preflight_payable_entitlement_foundation.sql`
- `scripts/sql/dry_run_payable_entitlement_foundation.sql`
- `scripts/sql/verify_payable_entitlement_foundation.sql`
- `scripts/tests/payable-artifacts.cjs`
- `scripts/tests/payable-browser.cjs`
- `scripts/tests/payable-catalog.json`
- `scripts/tests/payable-fixture.cjs`
- `scripts/tests/payable-postgres.test.cjs`
- `scripts/tests/payable-sql-static.test.cjs`
- `scripts/tests/payable-ui.test.cjs`

Modified existing files (5):

- `app/finance/finance-navigation.ts`: prepared link and active-route mapping.
- `app/finance/payments/vp-distribution-panel.tsx`: finalized-source action only.
- `app/finance/payments/vp-distribution.ts`: new localized backend errors.
- `lib/i18n/catalog.ts`: bilingual Payables messages.
- `scripts/tests/vp-distribution-ui.test.cjs`: isolated new action fixture.

## Local Validation and Limits

Final local results: 149/149 isolated PostgreSQL tests and 58/58 focused
UI/static/regression tests passed. TH/EN browser checks passed at all four widths.

Focused PostgreSQL tests cover atomic finalization, all four synthetic rights,
canonical grouping, exact sums, idempotency, historical materialization, source
supersession, empty/company-only rights, immutable evidence, missing canonical
external identity, optimistic version/acknowledgment, RLS, private RPC grants,
future payout fail-closed behavior and financial non-interference. Both Payment
and Direct Money paths run with upstream regression fixtures.

The operator preflight/verifier execute locally as single SELECT statements and
the dry-run is executed to ROLLBACK. Its embedded migration is byte-identical to
the standalone candidate; no COMMIT, materialization or business fixture is part
of the operator script. The isolated PGlite engine does not establish real
multi-connection race behavior or guarantee a matching Production catalog.
Unique constraints, row locks and exact completeness guards are reviewed, but
the separate human Production preflight/rehearsal gates remain necessary.

UI/static/regression tests cover TH/EN, frozen values, separate components,
permissions, navigation, manual action/retry, no automatic writes and exact SQL
artifacts. The synthetic browser fixture blocks external network requests and
checks 390/768/1024/1440 widths, overflow, keyboard disclosures/focus and uncertain
materialization response recovery. Targeted ESLint, TypeScript, production build
and whitespace checks pass.

The broader existing `i18n-core.test.cjs` audit has two unrelated baseline
failures: the existing Thai `directMoney.error.permission` contains `Admin`, and
the untranslated-literal inventory reports 34 existing findings. Their text is
present in HEAD and is not introduced by this change. No unrelated i18n cleanup
is included. This does not represent an all-repository-test PASS.
