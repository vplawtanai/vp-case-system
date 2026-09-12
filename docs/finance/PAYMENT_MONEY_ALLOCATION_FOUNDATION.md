# Payment / Revenue Allocation Foundation

Migration 044 was manually applied by the business owner, who reported
`payment_money_allocation_foundation_verification_pass = true`, no failed checks,
no function/catalog differences and zero allocation/audit rows. Repository
finalization does not rerun Production SQL or authorize allocation UAT writes.
Migrations 001-043 remain unchanged. Applied 044 SHA-256:
`51ddffdef335a817f788843dc53dc50bec1d3772b41007d8d3cb163d3d8417ce`.

## Existing-flow audit

Repository evidence, not a claim to have inspected Production catalog state:

| Path | Present behavior | Boundary |
| --- | --- | --- |
| `app/finance/ledger/page.tsx`, `saveLedger` | Browser inserts income/expense rows or a paired transfer into `finance_company_ledger`; controlled by existing legacy permissions | Manual legacy bookkeeping, not Payment-derived |
| `app/finance/expense-claims/page.tsx`, paid-claim posting | Inserts a Ledger expense linked by `source_expense_claim_id` | Legacy claim workflow |
| `app/finance/compensation/page.tsx`, `saveDraft` / `insertAllocations` | Manually entered received amount creates `finance_compensation_batches` and recipient allocations | No confirmed Payment or Invoice line linkage is established |
| Same page, `postCompanyShare` | A finalized batch posts its company-share amount as Ledger income and records `ledger_entry_id` | This is a legacy net-share model, not gross economic revenue |
| Same page, formula helpers | `pao_line` 20/55/25, `tun_line` 20/40/40, `source_worker_qc` 20/40/40, travel 100% company, or custom | Percentages apply to manually entered received amount; no new entitlement policy inferred |
| Fee Agreement allocation snapshot, migrations 202607140003/005 | Prospective recipient/policy allocation, `received_professional_fee_before_vat` basis | A commercial agreement policy, not proof of money received or of economic line classification |
| Payment 021/022/027 | Confirmation is settlement authority. 027 may atomically create one original **cash-only** Cash Transaction | No Opening Balance means `pre_cutover_no_opening`; zero cash or receipt on/before cutoff means no original posting |
| Payment 028/029 | Erroneous correction and append-only Invoice reallocation; effective view omits zero legs | Neither establishes economic revenue or a general Payment-line coverage model |
| Payment 036/041 | Structured WHT bases/rates/line applicability freeze tax-credit evidence | Current structured line-review contract requires full Invoice coverage |
| 037-040, 043 documents | Receipt/Tax/Combined/corrections provide documentary evidence and upstream guards | Issuance does not create new money |

The checked-in code has no implemented revenue-allocation domain. References to
`finance_revenue_allocations` in older dependency guards are catalog-aware probes,
not table creation. The Receipt test harness has an empty hypothetical probe table;
the new isolated fixture removes that stub before testing 044. Production preflight
**fails** on any real competing revenue/money allocation domain, even if empty.
Original legacy Ledger/Compensation DDL predates checked-in migration history, so
unrecorded Production triggers cannot be certified from repository source alone.

### Double-posting risks

- Manually posting a gross Payment into legacy Ledger and later enabling 027 cash
  posting can duplicate the same receipt across two histories.
- Legacy Compensation already posts the company share to Ledger; posting gross
  economic revenue as another cash receipt would count money twice.
- WHT is not bank cash. Neither VAT nor gross settlement is automatically revenue.
- Documents and allocation finalization must not be treated as another receipt.
- Existing UAT/historical Payments must not be bulk classified or backfilled.

044 does not write, read balances from, or change these legacy posting handlers.
It introduces no posting consumer or new automatic action on Payment confirmation.

## Domain and invariants

`finance_payment_money_allocations`: one active revision per Payment, with an
immutable source evidence envelope and separately controlled economic decisions.
`finance_payment_money_allocation_audit`: append-only actor/time/full-revision events.
The new name intentionally distinguishes economic review from existing Invoice
settlement allocations and does not activate older blind downstream table probes.

Lifecycle: **Draft -> Reviewed -> Finalized**. Draft can be saved while incomplete.
Reviewed/Finalized evidence cannot be edited. Admin may explicitly **Supersede**
with acknowledgement and reason; the old evidence remains byte-equivalent, and a
new Draft links `previous_id` to the prior revision. Supersession does not refund,
reverse, collect, reallocate or move any money. There are no posting consumers to
reverse in this phase; a future consumer must block supersession or coordinate it.

- `cash + WHT = settlement` independently at Payment and proven source-line levels.
- `before VAT + VAT = gross settlement coverage` for each fully covered line.
- Economic category applies to the **before-VAT base**, never to VAT or WHT credit.
- WHT reduces the line's actual-cash contribution, not its economic base.
- Source Invoice/item IDs, frozen complete Invoice evidence, effective Invoice
  allocations, resolved frozen VAT treatment and exact stored WHT components are
  retained in the source envelope. Live company/Charge/customer changes do not
  rewrite it. The existing frozen document-line reader is reused.
- Source and revision comparisons protect review/finalization against stale tabs.
- Exact duplicate saves/transitions do not append duplicate revisions/audit events.
- Per-Payment locks, Invoice locks, unique active revision and deferred evidence/
  audit guards provide server-side integrity; client validation is only UX.

## Exact-line scope and economic decisions

Full coverage requires **this Payment's effective allocation** to equal the issued
Invoice total and all frozen line facts to reconcile. A fully settled Invoice
assembled from several partial Payments is **not** evidence that each Payment
covered particular lines. No amount matching or pro-rata method is introduced.

Multi-Invoice Payments preserve each effective Invoice leg. Fully covered legs can
be explained, but any unresolved partial leg prevents review/finalization of the
aggregate. Its unresolved settlement is visible; the Draft remains unallocated.
Unknown VAT treatment, missing/mismatching WHT components, invalid frozen evidence,
or an already corrected tax source also fail closed. Legacy snapshot shapes not
supported by the shared reader remain unresolved; no live-source fallback is used.

Controlled categories: `company_revenue`, `pass_through`, `disbursement`,
`client_money`, `other`, and `unallocated`. These are internal economic review
buckets, not automatic legal/accounting determinations. Every source line defaults
to `unallocated`, even `professional_fee` or `outside_scope`. Existing Billable
Charge classifications describe commercial purpose, not necessarily ownership or
revenue recognition. An Admin must select a category and give supporting reason/
evidence for each line. A whole source line has one category in V1; splitting its
base among categories requires a later explicit, auditable contract.

For the synthetic 19,280 example, the source explains cash 19,160, WHT 120, VAT
607.10, and bases 4,000 + 10,000 + 4,672.90 = 18,672.90. It does **not** claim
18,672.90 is all company revenue. In particular, outside-scope VAT on the 10,000
line does not establish pass-through treatment. No actual UAT Payment is allocated.

## Correction and source changes

New source-write triggers block Payment changes/reversal, raw/effective allocation
changes, WHT component changes, relevant Invoice/item changes and non-copy issued
tax corrections while a Reviewed/Finalized money allocation exists. Guards operate
at the actual table write, preserving existing RPC bodies and their other guards.
The caller receives `MONEY_ALLOCATION_SUPERSEDE_REQUIRED` with clear TH/EN feedback.
Admin must supersede the old evidence first, with a reason. Draft evidence can
become stale, but cannot be reviewed/finalized without explicitly saving fresh
source evidence and re-reviewing its categories. No silent invalidation or rewriting
of finalized decisions occurs.

The 043 correction chain is followed through its original Tax Invoice's Invoice
link, including Combined tax children. Credit/debit/reissue history makes a new
economic allocation review-blocked in this phase; interpreting corrected bases
needs a separate contract. Replacement copies do not change economic facts and
therefore do not invalidate the allocation. Existing documentary coverage guards
remain authoritative even after a money allocation is superseded.

Source mutation and finalization serialize on Payment rows. Invoice-first existing
operations can encounter a PostgreSQL deadlock against Payment-first operations;
PostgreSQL aborts one transaction atomically. No successful transaction may leave
stale finalized evidence. This is not an automatic retry/posting engine.

## Permissions and UI

Existing `current_user_can_view_finance_payments()` controls read access. Active
Admin alone can save/review/finalize/supersede; Partner is read-only for this new
domain. No new broad user permission flags. Browser table mutation and private
helper execution are revoked; all new mutations are authorized controlled RPCs.
The Payment detail route also admits Partner read access already allowed by RLS;
existing Payment lifecycle action permissions are unchanged.

Confirmed Payment exposes a compact TH/EN **Money Allocation / การจัดสรรเงิน**
section. Reversed Payment retains history access. Shared `DetailModal` contains
source totals, tax evidence, line categories/reasons, explicit review/finalize
acknowledgement and a separate supersession area. Draft save is separate from
review/finalization. Stale/partial data has visible blockers; errors are actionable
without exposing raw SQL. No document renderer changes.

## Future consumers, not implemented

The read context reports `eligible_for_future_policy_review` only for current,
source-valid Finalized evidence; `posting_enabled` is always false. Consumers must
use `(allocation_id, revision, invoice_id, invoice_item_id)` and a future immutable
posting/consumption key, not a UI label or Payment amount match.

- Cash: consume the original Payment cash path, never create cash from allocation.
- VAT: consume source-line VAT as a separate tax obligation, not economic revenue.
- WHT: consume structured tax-credit evidence; never book it as cash.
- Compensation/referral: apply separately approved eligibility and received-revenue
  policy to finalized economic bases; no automatic entitlement, netting, percentage
  distribution, or retained-company amount is calculated here.
- Management: categorize before-VAT bases and tax/settlement instruments separately.
  `company_revenue` is not company cash balance or net profit.

## Operator workflow and safety

The local next-unused number was verified as `202607180044`. Preflight checks no competing domain,
new RPC namespace unused, required source contracts and exact predecessor function
bodies, plus the current no-Opening-Balance condition. No Production query was run
by Codex. If any check fails, stop for actual catalog review, not guessed edits.

The following completed operator workflow is retained as deployment evidence,
not as instructions to reapply Migration 044:

1. Human runs `scripts/sql/preflight_payment_money_allocation.sql` first.
2. Return its one result row for review before proceeding.
3. After review, human rehearses the exact standalone migration using the
   rollback-only dry-run. It embeds 044 byte-for-byte, contains no business RPC
   calls, stores transaction-local before-hashes and checks unchanged upstreams.
4. Human approval/application and a passing post-apply verifier precede
   commit/deployment of this schema-dependent UI. This gate has now passed.

Preflight/verifier are one SELECT-only statement and one result row with named
checks, `failed_checks`, exact catalog/function differences and upstream hashes.
Ledger/Compensation row counts are **not** fixed invariants; hashes permit an
operator to compare before/after, and transactional dry-run asserts no changes.
Production's protected Payment 95E22D0E and Combined Draft D903B209 are never
read through the UI, allocated, refreshed, issued or otherwise modified here.

Tests use PGlite synthetic fixtures and closed-network local browser adapters.
No external logging/dependency is added. Applied migration files stay unchanged.

## Prepared file inventory

Only these 20 files belong to this task. Other existing untracked diagnostics and
migrations are unrelated and remain untouched.

- `supabase/migrations/202607180044_add_payment_money_allocation_foundation.sql`
- `scripts/sql/preflight_payment_money_allocation.sql`
- `scripts/sql/dry_run_payment_money_allocation.sql`
- `scripts/sql/verify_payment_money_allocation.sql`
- `app/finance/payments/[id]/page.tsx`
- `app/finance/payments/shared.ts`
- `app/finance/payments/money-allocation.ts`
- `app/finance/payments/money-allocation-panel.tsx`
- `app/finance/payments/money-allocation.module.css`
- `app/finance/tax-corrections/shared.ts`
- `lib/i18n/catalog.ts`
- `lib/i18n/messages/money-allocation.ts`
- `scripts/tests/i18n-core-workspaces.test.cjs`
- `scripts/tests/money-allocation.test.cjs`
- `scripts/tests/money-allocation-postgres.test.cjs`
- `scripts/tests/money-allocation-browser.cjs`
- `scripts/tests/money-allocation-fixture.cjs`
- `scripts/tests/money-allocation-artifacts.cjs`
- `scripts/tests/money-allocation-catalog.json`
- `docs/finance/PAYMENT_MONEY_ALLOCATION_FOUNDATION.md`

### Local verification scope

The synthetic mixed fixture reproduces the requested amounts without using any
Production IDs. PostgreSQL tests cover exact source evidence, partial/multi-Invoice
coverage, explicit classification, Admin/Partner/RLS, stale changes, source guards,
idempotent retries, append-only correction, late audit failure rollback, artifact
drift and zero downstream side effects. Existing document regressions run too.
Browser tests cover TH/EN, 390/768/1024/1440, keyboard focus restoration, field
validation, read-only/partial states and unsaved choices retained after closing or
switching language. Screenshots use synthetic data and the real shared modal.

PGlite provides isolated PostgreSQL execution, not Production catalog attestation
or a multi-session concurrency stress test. Production verification is the
business owner's reported result; repository finalization does not repeat it.

After deployment, the human opens confirmed Payment 95E22D0E and inspects the
Money Allocation modal, its unallocated state, frozen source lines and separate
cash/WHT/VAT/base amounts. Stop before saving, reviewing or finalizing an allocation.
