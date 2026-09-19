# Tax Filing and Remittance Foundation (052)

Status: the business owner reported manual Production apply and passing post-apply
verification, with empty failed checks, catalog differences and function differences.
All five filing/remittance tables remain empty; confirmed Payouts = 0, Cash rows = 2,
Opening Balance rows = 2. Repository finalization and UI deployment are authorized;
Production SQL execution, business writes and lifecycle UAT are not.
Applied migrations 001-051 are unchanged. Applied Migration 052 is preserved exactly:
SHA-256 `28717cf534fba05b7591b188b15646c0833177bf412caf1a35c3864fd7ed6b2b`.

## Focused source audit

- 050 owns immutable source revisions, fingerprints and tax facts. Effective facts are
  those whose revision has not been superseded. Output VAT follows the existing
  issued Tax Invoice/correction/Direct Money contracts, not Invoice gross or receipts.
- 050 has **no authoritative complete Input VAT register**: period input and net
  amounts are constrained NULL and input status is incomplete. Migration 052 cannot
  truthfully support a ready/filed VAT return yet. 052 VAT Drafts preserve only
  materialized output evidence, not all known monthly facts. The audited gap and
  applied 053 fix are documented in [Snapshot Consistency](TAX_FILING_SNAPSHOT_CONSISTENCY.md).
  No typed total or acknowledgement can override the incomplete-input blocker.
- 051 owns outgoing WHT obligations generated only by confirmed Payouts. Draft and
  cancelled Payout previews never enter this pool. Frozen `payee_json.entity_type`
  identifies natural/juristic buckets; missing or inconsistent evidence blocks review.
  Names, lawyer/referral roles and live Payee changes are not classification sources.
  Unclassified/broken facts remain inspectable with their source Payout link in
  separate review evidence; they do not become allocations or an invented liability.
- 051 obligations deliberately retain immutable `unfiled/not_remitted/0` source
  placeholders, validated by its integrity function. 052 derives operational status
  through allocation/filing/remittance joins, never updates those source rows.
- There were no per-return filing/remittance tables or reviewed deadline policy.
  The old 050 period action was untyped external evidence, not an authoritative
  VAT liability. 052 retires its browser EXECUTE permission and UI action, preserves
  the original function and all history, and blocks duplicate filing when earlier
  untyped filing evidence exists. Resolving that history needs a later controlled
  amendment/mapping design; this migration does not reinterpret it.

## Authoritative domain

Five additive tables: `finance_tax_filings`, `finance_tax_filing_allocations`,
`finance_tax_filing_audit`, `finance_tax_remittances`, `finance_tax_remittance_audit`.
The Cash table receives a nullable unique `source_tax_remittance_id` FK and guards.
No existing row is backfilled or rewritten.

Filing identity is month (first date), type and version. V1 types are `vat`,
`wht_natural`, `wht_juristic`. Legal buckets are explicit; this code does not assert
an unreviewed statutory form mapping for every person/category. VAT is labelled
P.P.30. Filing version 1 and nullable amendment relation reserve a future additive
contract, but issuing amendments is intentionally unsupported.

One effective Draft/ready/filed return per month/type. Cancelled Draft history remains.
Each source allocation freezes the original fact/obligation, FK, fingerprint and
economic key. Duplicate effective coverage, missing allocation/audit and rewritten
snapshots fail integrity checks. New revisions leave old filed snapshots untouched;
the read model explicitly flags changed sources for amendment review.

## Lifecycle and evidence

`draft -> ready_for_review -> filed`; Draft/ready cancellation requires reason and
acknowledgement. No editing of filed records. Draft source changes require cancelling
and preparing a new Draft. Readiness and filing recheck the authoritative source pool,
not browser totals. Client UUID retries are exact-input idempotent. Different input
with the same UUID fails closed; source/version checks reject stale submissions.

`filed` records an external real-world event, requiring actual date, reference,
evidence/location and acknowledgement. It does not submit anything to government
and creates **no cash movement**. Unknown deadlines remain NULL. Optional deadlines
require reviewed evidence; there is no hard-coded statutory calendar or reminder.

Incoming WHT credit stays a separate latest-source total. It never offsets VAT,
enters payable totals or becomes cash. With incomplete Input VAT, total period tax
payable remains unknown even when outgoing WHT has a known amount.

## Remittance and Treasury

Only a filed positive-amount return can have one effective full remittance.
Zero tax means filed/no-payment-required, not a fake payment of zero. Partial tax
payments are unsupported. Payment Draft records selected company bank/office-cash
account, actual date (on/after filing, not future), reference and evidence. There is
no automatic transfer or cash creation until explicit acknowledgement/confirmation.

Confirmation atomically freezes the remittance and inserts one confirmed `outflow`,
`other` Cash Transaction and matching audit evidence. The unique source FK prevents
duplicate posting. The amount is the authoritative full filing amount. Existing
Treasury balance/opening/access/active-account/cutoff rules are reused. Unknown is
never zero; confirmation requires a known opening. The existing allowed-negative
balance policy is retained with a visible warning. A changed account/balance blocks
confirmation; cancel and recreate the remittance Draft to review fresh evidence.

Lock order: filing producers use Payout lifecycle -> 050 source sync -> 052 workflow;
remittance uses 052 -> existing THB cash-cutover lock. Existing source/Cash functions
are preserved. Generic cash reversal of a tax remittance is blocked until a later
coordinated reversal contract exists. No revenue, Ledger, Compensation, Payment,
Receipt, Tax Invoice, Payables or distribution write is added.

## Permissions and UI

Existing tax read authority is reused. Partner is read-only. Filing management uses
existing authorized tax management with Partner/viewer excluded. Remittance also
requires existing Cash confirmation authority and selected-account access. New tables
have RLS enabled with no browser raw privileges; only permission-checked public RPCs
are executable. Private helpers are not browser-callable.

The existing collapsed rail, focus/hover expansion, Finance order and Legacy menu
remain byte-identical. Tax Position keeps its dashboard and receives two internal
tabs: Overview and Filing/remittance (`/finance/tax-position/filings`). Existing source
materialization and incoming certificate evidence remain available. Old untyped filing
actions are replaced by the new operational route, not a second filing path.

Page content follows the supplied mockup: four restrained summaries, month selector,
dense filing table, right-side summary/checklist, actionable issues, and history.
Unknown VAT replaces the mockup's example totals. Filing and payment modals are separate;
all evidence, audit JSON and identifiers are secondary/collapsed. TH/EN and stacked
mobile rows use VP UI System v1 without changing the shared navigation.

## Operator artifacts and validation

- `scripts/sql/preflight_tax_filing_remittance_foundation.sql`: one SELECT, one row,
  named checks, namespace/prerequisites, exact upstream functions and evidence hashes.
- `scripts/sql/dry_run_tax_filing_remittance_foundation.sql`: BEGIN, preflight guard,
  exact embedded Migration 052, verifier, ROLLBACK; no COMMIT or business RPC call.
- `supabase/migrations/202607180052_add_tax_filing_remittance_foundation.sql`: applied artifact.
- `scripts/sql/verify_tax_filing_remittance_foundation.sql`: one SELECT, one row,
  named checks, failed_checks, exact catalog/function differences, zero foundation,
  privileges, preserved upstream hashes. Mutable global counts are observability only.

Artifacts are generated deterministically from Migration 052 and an isolated PostgreSQL
catalog fixture. The dry-run compares all protected upstream evidence before/after
within its rolled-back transaction. Standalone post-apply output must be compared with
preflight hashes by the human operator. No Production execution is performed by tests.

Local tests cover VAT/confirmed-only sources, frozen legal classification, old filing
conflicts, source changes, allocations, immutable history, permissions/RLS, exact retries,
known/unknown/negative Treasury balances, rollback on audit failure and upstream boundaries.
Browser tests run actual React/CSS/VP navigation with synthetic adapters, blocked external
requests, TH/EN at 390/768/1024/1440, validation and focus restoration.

## Prepared file inventory

- UI: `app/finance/tax-position/page.tsx`, `module-nav.tsx`, and
  `filings/page.tsx`, `filings/workspace.tsx`, `filings/shared.ts`,
  `filings/filings.module.css` under that module.
- Localization: `lib/i18n/catalog.ts`, `lib/i18n/messages/tax-filings.ts`.
- The four SQL artifacts above and this architecture document.
- Tests: `scripts/tests/tax-filing-postgres.test.cjs`, `tax-filing-static.test.cjs`,
  `tax-filing-ui.test.cjs`, `tax-filing-browser.cjs`, `tax-filing-fixture.cjs`,
  `tax-filing-artifacts.cjs`, `tax-filing-catalog.json`.
- Reused test infrastructure: `scripts/tests/vp-distribution-artifacts.cjs` adds
  timestamp return-type metadata support; `scripts/tests/tax-position-browser.cjs`
  checks the retired filing entry point and retained source/certificate workflows.

## Human rollout gate

The manual apply/post-apply gate has passed. Operator SQL remains as deployment
evidence, not instructions to reapply Migration 052. Deployment does not authorize
creating filings, recording an external filing or confirming a remittance.

After deployment, the human opens Tax Position -> Filing and remittance for the
current month. Inspect incomplete Input VAT, unknown net VAT/total payable, incoming
WHT shown separately, no outgoing liability from cancelled Payout 3977A5EA, and empty
filing/remittance history. Check TH/EN and send screenshots. Stop before creating any
Draft or recording any filing/payment; existing Production records remain untouched.

## Reviewed due-date contract (054 applied and verified)

The business owner confirmed manual Production apply and post-apply PASS:
`finance_ux_integrity_hardening_verification_pass = true`, with empty failed checks,
catalog differences and function differences. Repository finalization/deployment is
authorized; no Production business write or reviewed-rule publication is authorized.

Audit found no reviewed deadline rule, channel/default setting or authoritative holiday
calendar in 052/053. The previous optional manual date/reference was not an automatic
rule source. No legal dates or holidays are inferred or seeded by this hardening task.

Migration 054 adds the append-only reviewed rule registry:
`finance_tax_deadline_rules`, controlled by Admin-only
`publish_finance_tax_deadline_rule`. Each rule records filing type (VAT/natural-person
WHT/juristic-person WHT), online/paper channel, effective period range, due day in the
following month, explicit holiday policy and reviewed calendar coverage, source
reference, review reason, version, actor/time, and optional superseded rule.
Exact retries are idempotent. Overlapping independent rules are blocked; correction
or withdrawal appends a version for the same range, never edits history. No default
weekends, calendar dates or automatic government extensions are assumed.

`get_finance_tax_deadline` returns a calculated date only inside reviewed calendar
coverage. Missing/withdrawn/out-of-coverage rules return `review_required` and null,
displayed as "ต้องตรวจสอบกฎกำหนดส่ง". Online is a controlled UI initial selection,
not a new company master setting. No duplicate configuration or upload is added.
Real rule publication still requires an independently reviewed business/legal source;
fixture days and holidays are explicitly synthetic, not recommended statutory dates.

Normal operators choose channel and see the system date, without a manual date or
evidence field. Admin may explicitly enable an exception requiring date, reason and
reference/URL, with server actor/time. No attachment is required. This does not change
financial readiness, filing/remittance transitions, source collection or VAT arithmetic.

New `create_finance_tax_filing_review` freezes the exact reviewed deadline and optional
override in `deadline_snapshot_json`, and the existing created audit freezes the whole
row. Financial `source_snapshot_json` remains the 053 schema-2 monthly/coverage
contract. Reviewed deadline changes reject stale creation; exact retry preserves the
original frozen evidence. Existing immutable-row/audit guards protect the new column.
The original create RPC body is preserved but execution is revoked for browser roles,
so arbitrary manual date input cannot bypass the new entry point. Existing filed
snapshot JSON is not retroactively rewritten; deadline evidence lives in the row/audit.

Compatibility gate: migration application requires zero Filing rows. Adding a column
changes whole-row audit equality, so an existing Filing must trigger STOP and separate
compatibility review, not backfill or repair. Preflight also preserves the verified
053 zero-state and September facts. A Draft may remain unready with a null deadline;
deadline availability cannot turn incomplete Input VAT into a ready filing.

Retained operator artifacts (manually applied by the owner, never executed against
Production by the implementation agent; do not reapply):

- `scripts/sql/preflight_finance_ux_integrity_hardening.sql`: one SELECT/row, exact
  prior 053 contracts, zero-state, unused namespace and upstream evidence hashes.
- `scripts/sql/dry_run_finance_ux_integrity_hardening.sql`: literal BEGIN/ROLLBACK,
  guarded preflight, exact embedded 054 and detailed verifier. No COMMIT/business UAT.
- `supabase/migrations/202607180054_add_reviewed_tax_deadlines.sql`: immutable applied artifact.
- `scripts/sql/verify_finance_ux_integrity_hardening.sql`: one SELECT/row; named checks,
  failed checks, catalog/function differences, unchanged financial evidence hashes.

Operator must compare all upstream hashes before/after; mutable Ledger/Compensation
counts are not fixed gates. Local fixtures cover permissions, idempotency, stale rules,
immutable overrides, strict cutoff rejection, schema-2 VAT 700/coverage 0/null tax/false
ready, and literal rollback. No Production Draft or rules have been created here.
After deployment, human UAT is inspection only: Treasury flow/stock and historical
cutoff evidence, active sidebar reveal, and Tax Filing review with no invented deadline.
Stop before creating rules, Filing Drafts, remittances, Openings or Cashbook entries.

### 054 finalization inventory and validation

Only these 36 files belong to the hardening work; 25 pre-existing unrelated untracked
files remain untouched and excluded from staging. Paths are repo-relative:

```text
app/components/AppTopNav.tsx
app/components/AppSidebar.module.css
app/components/sidebar-reveal.ts
app/components/DetailModal.tsx
app/finance/FinanceEvidence.tsx
app/finance/treasury/page.tsx
app/finance/treasury/shared.ts
app/finance/treasury/dashboard.ts
app/finance/treasury/dashboard-view.tsx
app/finance/treasury/relationship.tsx
app/finance/treasury/treasury.module.css
app/finance/tax-position/page.tsx
app/finance/tax-position/filings/workspace.tsx
app/finance/tax-position/filings/shared.ts
app/finance/tax-position/filings/technical-evidence.tsx
app/finance/tax-position/filings/deadline-review.tsx
app/finance/tax-position/filings/filings.module.css
lib/i18n/messages/treasury.ts
lib/i18n/messages/tax-filings.ts
docs/ui/VP_UI_SYSTEM_V1.md
docs/finance/TREASURY_CASHBOOK_FOUNDATION.md
docs/finance/TAX_FILING_REMITTANCE_FOUNDATION.md
scripts/tests/finance-hardening-artifacts.cjs
scripts/tests/finance-hardening-catalog.json
scripts/tests/finance-hardening-postgres.test.cjs
scripts/tests/finance-hardening-ui.test.cjs
scripts/tests/treasury-dashboard-fixture.cjs
scripts/tests/treasury-dashboard.test.cjs
scripts/tests/treasury-browser.cjs
scripts/tests/tax-filing-ui.test.cjs
scripts/tests/tax-filing-browser.cjs
scripts/tests/tax-position-browser.cjs
supabase/migrations/202607180054_add_reviewed_tax_deadlines.sql
scripts/sql/preflight_finance_ux_integrity_hardening.sql
scripts/sql/dry_run_finance_ux_integrity_hardening.sql
scripts/sql/verify_finance_ux_integrity_hardening.sql
```

Local validation: 84 focused UI/helper/static/regression tests and 54 isolated
PostgreSQL cases (049:12, 050:8, 051:8, 052:10, 053:8, 054:8). PGlite fixtures never
connect to Production; they are not a live multi-session concurrency/load test.
The literal dry-run executes then rolls back, with matching upstream hashes and
exact catalog/function manifest. Preflight and verifier each remain one SELECT/row.
All 80 tracked migration artifacts through 053 remain byte-identical to pre-task HEAD.

Closed-loopback real React browser suites passed Treasury, Tax Position and Filing
TH/EN at 390/768/1024/1440, no external requests, responsive geometry, nested evidence,
operator/Admin boundaries and modal focus. Treasury additionally checks active reveal
on Treasury/Tax/Filing/Payables/Legacy routes, reduced motion and no scroll hijacking.
1440/390 screenshots were visually inspected; menu horizontal clipping was corrected.
Targeted ESLint (zero warnings), TypeScript, production build and whitespace checks pass.

Applied 054 SHA-256 (unchanged from the prepared artifact):
`daf3fe7d5f33ba4c8eae0de8cd001973f7843c161e8ac5e7969be9e79b85cad1`.
Applied 053 SHA-256 remains
`5438f8dad942c3bdc9793c79434bebbeec576b1ff5b6c8a790f7e133d5575914`.
