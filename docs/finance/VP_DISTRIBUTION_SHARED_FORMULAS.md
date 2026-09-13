# Shared VP Formula Evidence: Migration 046

## Status and scope

The business owner reported manual Production apply and successful verification:
vp_distribution_formula_verification_pass = true, failed_checks = [],
formula_function_differences = [], distribution_rows = 0 and
distribution_audit_rows = 0. Repository finalization and UI deployment are now
authorized; no Production business write or migration execution is authorized.
Work is confined to vp-case-web.

Migration 046 retains the exact prepared, human-applied artifact. SHA-256:
39f5d3e7164c67266eabcd185a4787ecf8adfcdac88f2bdd1c1be882407c3c4b.
The local migration inventory ended at 045 before preparation. The retained
operator scripts document that completed prerequisite/rehearsal/apply workflow,
not instructions to repeat it during finalization.

This candidate supersedes the normal editable-044 UI and the aggregate-only
professional split UI described in VP_REVENUE_DISTRIBUTION_FOUNDATION.md. It does
not rewrite that applied 045 artifact or any 001-044 migration.

## Existing Compensation audit

The audited page was app/finance/compensation/page.tsx at
a5a56f63617791a5f03f6cb18af8d6756bb2ff58. Audit preceded behavioral edits.

| Concern | Existing contract |
| --- | --- |
| Formula identity | Five coded form-time presets; no reusable database formula catalog, editor, or versioned formula-management page. |
| Pao / Tun | Company/Pao/Tul defaults 20/55/25 or 20/40/40. Rows and parameters are editable; these are not immutable personnel assignments. |
| Source/worker/QC | Source 20%, company 40%, work pool 40%; one lead owner receives the remaining work percentage. Multiple co-workers, assistants, QC and other work roles are supported. |
| Travel | One 100% company component. Selecting this preset for a professional line is an explicit human choice, never description-based classification. |
| Custom | Entered recipient amounts are retained by save normalization. The old editor synchronizes displayed percentage/amount inputs; it does not implement a separately declared mixed fixed-plus-variable rule. |
| Income type | Manual legacy revenue_type is independent of formula_code. It is not authoritative Invoice classification, VAT or WHT evidence. |
| Stored legacy result | Batch formula_code and received amount; allocation recipient_type, user ID/name, role_label, percent, amount, is_company_share, paid status. No independently versioned reusable rule snapshot. |
| People | Active user_profiles using staff_name, full_name, email, ID as label fallback. Existing external-recipient option uses an explicitly entered name, not another person master. Legacy test-name filtering is presentation logic, not an identity rule. |
| Reconciliation | Legacy two-decimal rounding and up-to-0.01 tolerance remain unchanged. Custom preserves entered amounts; other formulas normalize from percentages. |
| Permissions | Existing legacy permissions unchanged. They do not grant new-domain management rights. |

Canonical recipient types: company, source, lawyer, lead_lawyer, worker, assistant,
qc, other. Canonical preset roles include Client Source / Broker, Company Share,
Lead Lawyer / Case Owner, Co-Lawyer / Co-Worker, Assistant, Quality Controller,
Other; old presets also carry Company and Lawyer. Custom role text is explicit.

### Side effects deliberately NOT reused

Legacy saveDraft creates/updates finance_compensation_batches. insertAllocations
deletes/reinserts its rows through separate requests. finalizeBatch changes batch
status. postCompanyShare rereads a finalized batch, sums its company rows, chooses
KBANK, inserts finance_company_ledger, then separately links/audits the batch.
Recipient paid flags and batch void are separate legacy actions. These handlers
remain in the old page and are not imported or called by Distribution.

The original legacy DDL predates checked-in history. This work does not attest its
Production constraints, invent new legacy permissions, or repair legacy posting.

## One maintained formula source

compensation/formula-definitions.json is the one maintained definition source.
Both selectors, default rows and label keys use it. formula-engine.ts contains
the mechanically extracted legacy pure helpers; differential tests compare the
presets and normalizers against the pre-extraction page.

formula-calculation.ts adds the authoritative exact-cent execution mode to this
shared domain, not a second set of formula definitions or a management screen.
Candidate 046 embeds a generated copy of the same JSON for server validation.
Artifact checks require byte-consistent content/semantic JSON equality and the
same legacy aggregate validator. UI/backend results are parity tested.

Legacy batch rounding is intentionally unchanged. New Distribution must reconcile
exactly, so its explicit policy is exact_cents_largest_remainder_v1: floor each
percentage component to cents, then assign remaining cents by fractional remainder,
ties by component order. Each recipient freezes its rounding_adjustment_cents.
Percent parameters have at most four decimals; fixed amounts have at most two.
No 0.01 tolerance, negative input, unexplained residue, under/over allocation, or
zero-value component in a positive pool is accepted. A zero pool remains representable.
Custom uses its authoritative fixed amounts; percentages are not a second
independent parameter in that result. No new mixed-mode rule has been invented.

Source/worker rows reuse the existing 20/40/40 definition and owner-remainder
helper. Work percentages are displayed within the 40% pool; frozen percentages
are of the whole professional pool, avoiding an ambiguous denominator.

## Payment Composition: normal 044 UI

The normal Payment panel is now read-only Payment Composition / องค์ประกอบเงินรับ.
It reads the existing get_finance_money_allocation RPC only.
It shows settlement, actual cash, WHT credit, VAT, before-VAT base, remaining
unproven coverage, source Invoice links/coverage, source lines, line VAT/WHT
evidence, blockers and prior evidence history. No editable category, note, Save,
Review, Finalize or Supersede remains in this normal panel.

All 044 schema/functions/security/evidence remain unchanged. Its optional current
evidence is still frozen into Distribution. Existing contradictory/stale 044
evidence remains a blocker; this UI change does not silently erase that history
or bypass its backend guard. Administrative remediation, if needed, needs a
separately authorized controlled operation, not an automatic cleanup.

## Per-line Distribution

Confirmed Payment -> unchanged 044 source decomposition -> existing 045 routing
-> selected shared formula per professional line -> resolved/frozen recipients.

Pool = that line's before-VAT base minus its own attributable WHT.
VAT and WHT are excluded; WHT remains company tax credit, never cash.
Frozen additional_service, reimbursable_expense and government_or_court_fee
continue to route directly to company. Unknown classifications fail closed.
No inference from a description, a named formula, VAT or a matching total.

Each professional line has its own selector, recipients, parameters, preview,
allocated total and remainder. No formula is preselected on a new distribution.
Named preset recipients are hints only; no name is resolved to a UUID implicitly.
Admin selects an active existing user or explicitly declares an external name.
The server resolves and freezes the current trimmed authoritative display name,
checking and locking the profile on writes. A stale/deactivated person blocks
review/finalization until intentionally resolved. Partner reads saved evidence
but receives no selectable person directory and no mutation actions.

Explicit economic map, frozen with each formula:

| recipient_type | Bucket |
| --- | --- |
| company | company_share_amount |
| source | referral_amount |
| lawyer, lead_lawyer, worker, assistant, qc, other | work_compensation_amount |

Type is the declared economic classification; role_label describes that component.
The UI displays both. Custom role text is never parsed to infer another bucket.
Other means explicitly declared other work, not a generic pass-through category.
Duplicate recipient identity/role/bucket pairs within a line are rejected.
One person may receive distinct explicitly recorded roles; separate lines remain separate.

For supplied UAT facts, only the 10,000 professional pool invokes a formula.
Translation/travel remain company economic base 8,672.90 and company cash base
8,552.90. Cash 19,160 + WHT 120 = settlement 19,280; VAT remains 607.10.
These are user-supplied facts and synthetic test expectations, not a new Production read.

## Why a migration is required

YES. Applied 045 vp_distribution_choices rejects any key other than invoice_item_id
and three aggregate amounts. It cannot safely accept recipient/formula evidence
as arbitrary unvalidated JSON. Candidate 046 explicitly extends that contract.

No new business table, column, backfill or financial write is introduced.
The original aggregate validator is retained privately as
vp_distribution_amount_choices_v1 for existing history. A replacement
vp_distribution_choices validates any formula_result canonically against its
frozen definition. A new mandatory before-write guard requires complete,
current-catalog formula evidence and valid live recipients for new/edited Draft,
Reviewed and Finalized writes.

New private helpers: vp_compensation_formula_catalog, vp_formula_calculate and
vp_formula_result_guard. The only added authenticated RPC is read-only
get_finance_vp_formula_context(uuid), wrapping the existing permission-checked
reader with catalog/version and Admin-only active recipient choices.
Save/transition RPC names, signatures, source snapshots and optimistic contracts
remain unchanged. Direct authenticated mutations and private helper execution stay
revoked. Existing Admin-manage/Partner-read permissions, audited lifecycle,
idempotency, immutable history, stale sources and upstream guards are retained.

The human apply/verification gate for the formula UI has passed. Catalog mismatch
still fails closed. No auto-Save or auto-Finalize exists.

## Frozen evidence and historical compatibility

Each professional decision retains the three exact bucket amounts plus:

- formula_result.schema_version = 1
- formula_code (stable formula identity), formula_version and formula_snapshot
- snapshot of selected preset, default parameters, recipient bucket mapping and calculation policy
- exact professional pool and ordered recipients
- component_no, recipient_type, role_label, recipient_kind, user UUID or explicit external name
- authoritative frozen recipient_name, percent OR fixed_amount, calculated amount and bucket
- rounding_adjustment_cents and aggregate reconciliation

The existing distribution record provides Payment ID, source Invoice line IDs,
revision/version, full 044/045 source evidence, actors, review/finalize timestamps
and append-only audit. Frozen objects are detached from the live client catalog.
Historical rendering uses stored results, not a new calculation from current names.

Old aggregate-only records are not rewritten or assigned fictitious formulas.
Old Drafts must explicitly acquire a formula before review; old Reviewed/Finalized
evidence remains readable and may be superseded with the existing reason/ack guard.
A successor has new evidence linked to its immutable predecessor.
Catalog changes require a new version; Draft refresh is explicit and warns/reset
controls are available. Reviewed/Finalized evidence cannot refresh in place.
Future calculation-policy changes must retain old policy validators, not rewrite
the v1 interpretation.

## Future Compensation consumption contract

No consumer is implemented now. A later approved consumer must read a finalized,
current-source, non-superseded Distribution and consume its frozen components:
distribution_id + revision + invoice_item_id + component_no + consumer kind.
This key needs database uniqueness and atomic target linkage for deduplication.
It must not re-enter or recompute received amount, formula, recipient, percentage
or amount, and must not distribute the work envelope a second time.

Work/referral/company remain distinct. External names are explicit legacy-style
identity evidence, not a new verified payee master; any later payout needs a
controlled payee resolution without changing the frozen entitlement economics.
Already-consumed predecessors require a separately designed adjustment before
supersession is consumed. No automatic batch, referral payment, bank posting,
cash cutover or historical backfill is authorized.

## Operator sequence and limitations

The following completed workflow is retained as deployment evidence. Do not rerun
preflight/dry-run/apply as part of repository finalization.

1. Human runs ONLY scripts/sql/preflight_vp_distribution_formula_evidence.sql
   and returns the one result row. Stop on failed_checks or catalog differences.
2. After review/authorization, use the rollback-only dry_run counterpart. It embeds
   candidate 046 exactly, captures all upstream and 045 evidence hashes, verifies,
   then ROLLBACKs. No synthetic business rows or mutating business RPC calls.
3. Only a later explicit human apply decision can apply the standalone candidate.
   Run the post-apply verifier and compare every pre/post upstream_evidence_hashes
   value; then separately authorize repository finalization and deployment.

Preflight/verifier are one SELECT-only statement and one row with named checks,
failed_checks, exact predecessor/new function metadata, privileges, trigger/catalog
differences and observability. Mutable global Ledger/Compensation counts are not
pass/fail gates. Existing opening cutover must remain absent. The verifier does
not infer an absent prior baseline as proof of unchanged data: compare returned
hashes manually outside the rollback rehearsal.

Local PGlite exercises real PostgreSQL DDL, triggers, RPCs, RLS/ACL, rollback and
synthetic financial snapshots. It is not a Production catalog attestation or a
multi-session deadlock/performance benchmark. SQL uses existing public profile
columns, not a guessed new People table. The human preflight checks their supported
types. No Production access was used to prepare these artifacts.

## Prepared files

| Directory | Files |
| --- | --- |
| app/finance/compensation | page.tsx; formula-definitions.json; formula-engine.ts; formula-calculation.ts |
| app/finance/payments | money-allocation-panel.tsx; money-allocation.ts; vp-distribution-panel.tsx; vp-distribution.ts; vp-distribution.module.css; vp-formula.ts; vp-formula-editor.tsx |
| lib/i18n/messages | money-allocation.ts; vp-distribution.ts |
| supabase/migrations | 202607180046_add_vp_distribution_formula_evidence.sql |
| scripts/sql | preflight_vp_distribution_formula_evidence.sql; dry_run_vp_distribution_formula_evidence.sql; verify_vp_distribution_formula_evidence.sql |
| scripts/tests | vp-formula.test.cjs; vp-formula-postgres.test.cjs; vp-formula-sql-static.test.cjs; vp-formula-artifacts.cjs; payment-composition-ui.test.cjs; vp-distribution-artifacts.cjs; vp-distribution-fixture.cjs; vp-distribution-ui.test.cjs; vp-distribution-browser.cjs; money-allocation-browser.cjs; i18n-core-workspaces.test.cjs; i18n-legacy-finance.test.cjs |
| docs/finance | VP_DISTRIBUTION_SHARED_FORMULAS.md |

Existing artifact helper exports were shared; generated 044/045 SQL files remain
unchanged. Unrelated pre-existing untracked diagnostics/migrations remain untouched.

## Validation

- Full isolated backend/shared suite: 136 passing tests, including 121 prior regressions.
- Focused UI/static/shared/i18n regression suite: 42 passing tests.
- TH/EN browser workflows at 390/768/1024/1440: read-only composition, formula selection,
  required recipients, invalid parameters, exact result, Save/Review/Finalize, supersession,
  preserved local inputs, failed-write/read recovery, focus/Escape, blocked/legacy history.
- All browser traffic is loopback-only synthetic data; external requests blocked.
- Targeted ESLint, TypeScript, production build, SQL artifact checks and whitespace checks.
- Applied migration bytes through 045 compared to HEAD; 044/045 also checked against
  their approved SHA-256 values. Applied 046 is compared to its prepared SHA-256
  above and the exact embedded dry-run artifact, without another Production query.

No Production Payment/Invoice/Combined Draft was read or mutated. Payment 95E22D0E,
Invoice VP-IV-202609-000004 and Combined Draft D903B209 remain untouched by this task.

After deployment, the human may open Payment 95E22D0E, inspect read-only Payment
Composition, then open VP Revenue Distribution, select an existing formula and
resolve recipients for the 10,000 professional pool. Check the preview, language
state preservation and unchanged automatic company routing. Stop before Save,
Review or Finalize and return screenshots for review. No downstream entitlement
or posting is authorized by this inspection step.
