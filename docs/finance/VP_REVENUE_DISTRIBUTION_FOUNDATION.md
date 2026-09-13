# VP Revenue Distribution Foundation

## Status and authority

Applied `202607180045_add_vp_revenue_distribution_foundation.sql` adds the VP
distribution layer downstream from applied 044. On 2026-09-13 the business owner
reported successful manual Production apply and post-apply verification:
`vp_revenue_distribution_foundation_verification_pass=true`, with empty failed
checks, function/catalog/inventory/source-guard differences, and zero distribution
and audit rows. `dry_run_baseline_present=false` is expected outside the dry-run;
`dry_run_upstream_unchanged=true` and protected upstream hashes passed.
Local automated and responsive browser validation passed. Repository finalization
and deployment are authorized; no Production business write or migration execution
is authorized. The applied artifact remains byte-identical to the prepared file:
`fd9675fa91148dc03dbe7ff8ecc09d892ac566ae9358658efe17ec31b94979f3` (SHA-256).
The formulas below implement the supplied VP policy, not a new legal/tax opinion.

044 remains the source decomposition/evidence layer, not a compensation formula.
Its applied file and function bodies remain unchanged. Verified local SHA-256:
`51ddffdef335a817f788843dc53dc50bec1d3772b41007d8d3cb163d3d8417ce`.

## Existing Compensation audit

Actual implementation: `app/finance/compensation/page.tsx`, not a separate
`legacyCompensation` module. Principal handlers: `saveDraft` (334),
`insertAllocations` (392), `finalizeBatch` (437), `postCompanyShare` (452),
`markAllocationPaid` (566), formula generation/validation (916/953), and save
normalization (1033).

| Question | Audited behavior |
| --- | --- |
| Work compensation | Non-company recipient rows in `finance_compensation_allocations`; source/broker rows are also non-company, so the flag alone does not prove work. In `source_worker_qc`, work is every non-source, non-company row, with lead/co-worker/assistant/QC roles. |
| Company share | Sum of recipient amounts marked `is_company_share=true`, associated with a `finance_compensation_batches` row. This is legacy net share, not gross receipt or economic base. |
| Referral | Existing `recipient_type='source'`, `Client Source / Broker` role, recipient name/user, percentage and amount; agreement JSON also has a source role. No separate Payment-backed referral-obligation lifecycle was found in the audited paths. |
| Trigger | Human-entered received amount/date, revenue type, formula and optional client/case/matter; draft save creates batch/rows, then a separate action finalizes. These handlers establish no confirmed Payment, frozen Invoice-line or 044 linkage. |
| Recipient paid flag | Separate allocation update of `payment_status`/`paid_at`, with audit attempt; the handler itself creates no Cash/Ledger evidence and excludes voided batches without requiring finalized status. |
| Partner sharing | Named-lawyer formulas and recipient rows, not a separate distribution engine in the audited flow. Role permissions do not establish entitlement policy. |
| Source classification | Manual batch `revenue_type` is independent of formula selection. The calculation path neither reads frozen `economic.classification` nor separates VAT/WHT. |

| Legacy formula | Split of manually entered received amount |
| --- | --- |
| `pao_line` | Company 20%, Pao 55%, Tul 25%. |
| `tun_line` | Company 20%, Pao 40%, Tul 40%. |
| `source_worker_qc` | Source 20%, company 40%, work pool 40%; multiple recipients divide that pool and the lead owner receives its remaining percentage. |
| `travel_fee` | Company 100%. |
| `custom` | Entered rows/amounts and percentages; company row is optional. |

Legacy percentage calculation rounds to two decimals; amount validation permits
a difference up to 0.01. Source/company/work ratios are specifically enforced;
Pao/Tun defaults are generated but not equivalently enforced by that validator.
Custom normalization preserves entered amounts. Recipient summary role/name
heuristics are display logic, not authoritative classification or identity.

### Separate company Ledger posting and permissions

`postCompanyShare` explicitly rereads a finalized batch, checks its Ledger link,
sums loaded company rows, selects active `KBANK`, and inserts legacy Ledger income
with `source_compensation_batch_id`. A separate request marks the batch posted
and links `ledger_entry_id`; audit requests follow. A custom batch with no company
amount can become posted without a Ledger row. Posted/linked batches cannot be
voided through the handler; no automatic Ledger reversal occurs.

Draft replacement deletes/reinserts rows through separate requests; Ledger insert
can succeed before batch linkage fails. Original legacy DDL predates checked-in
history, so actual Production uniqueness/triggers cannot be certified here.
This is a limitation, not evidence of a missing live constraint.

Manual Ledger `saveLedger` (`app/finance/ledger/page.tsx:391`) and paid Expense
Claim posting (`app/finance/expense-claims/page.tsx:460`) remain separate.
027 Payment confirmation may create an original **cash-only** Cash Transaction
under existing cutover rules; zero cash/no applicable opening balance/pre-cutover
receipts do not create an original posting. Distribution is not another receipt.

`lib/permissions.ts:320` and migration `202606290001` allow Admin/Partner
Compensation drafts. Finalize/post/mark-paid use the explicit compensation-edit
flag; void has its own flag. Company Ledger editing is separate; the company-post
handler checks compensation-edit, with actual inserts still subject to database
policies. These legacy permissions do not grant new-domain mutation rights.

### Fee-agreement formulas and reuse

Migration `202607140003_save_fee_agreement_allocation_draft.sql` validates version-1
allocation JSON on `received_professional_fee_before_vat`: Pao 20/55/25, Tun
20/40/40, source/company/worker 20/40/40, custom, or reasoned `no_allocation`.
Positive percentages total 100, recipient/role pairs are unique, company cannot
bind a user, and custom non-company rows require user IDs. Eligible professional
fees/excluded VAT and expense categories are prospective policy, not Payment or
line-classification evidence; there is no attributable-WHT subtraction.

Migration `202607140005` removes direct draft/item write policies; `202607140007`
removes allocation as an activation prerequisite and explicitly marks agreement
allocation non-authoritative for compensation. Retained snapshots are not a
distribution source or automatic preset.

Reuse 044's private reader, immutable-source identities, shared modal/i18n and
controlled lifecycle patterns. Keep legacy formulas, manual batches, name/role
heuristics, paid flags and company Ledger posting separate. No automatic presets,
batch creation or fee-agreement formula import. A later work consumer must not
reapply a gross legacy split to an already allocated work envelope.

## Source and relationship to 044

Confirmed Payment -> unchanged private `money_allocation_source(uuid)` ->
VP Revenue Distribution -> finalized evidence -> later approved consumers.
New authorized server RPCs reuse the helper internally; its browser execution
remains revoked. The full deterministic reader result is frozen, not totals only:
Payment context, effective Invoice legs, issued snapshots, source lines/IDs,
VAT treatment, complete WHT evidence, corrections, totals, blockers and version.

044 uses migration 040's `finance_document_invoice_lines` to unwrap and validate
issued frozen items. Classification comes only from:
`source.lines[].source_item.source_snapshot_json.ready_snapshot.economic.classification`.
`readySnapshot` denotes that stored ready snapshot, not live Charge state.
Invoice display reads the same economic field in `app/finance/invoices/shared.ts:273`.
Missing/malformed lineage fails closed; descriptions, VAT treatment, current
agreement and manually selected legacy revenue type cannot fill evidence gaps.
Frozen Charge client must match the frozen Invoice header and confirmed Payment
client; mutually consistent but false frozen client headers also block.

The optional FK points only to an **existing current** 044 row for this Payment.
Freeze that row's full evidence/ID/revision/version/decisions or explicit absence.
Never create a 044 record, call its save/transition automatically, or require a
generic company-revenue selection before deterministic routing.
A stale current 044 snapshot blocks; a null FK/older revision cannot bypass it.
`unallocated` is not a contrary decision; `company_revenue` is compatible but
does not assign a professional pool wholly to company. `pass_through`,
`disbursement`, `client_money`, ambiguous `other`, or malformed decisions block.

Inherit all 044 source blockers: each Invoice must be fully covered by **this**
Payment, not several partial Payments combined. Unknown VAT, unresolved WHT,
unproven/mismatched source, context/currency mismatch or non-copy issued tax
correction blocks. No inferred/pro-rata line coverage or WHT apportionment.

## Exact VP model and cash bridge

For each proven line: base `B`, VAT `V`, attributable WHT `W`,
settlement `S=B+V`, actual cash `C=B+V-W`; therefore `C+W=S`.
Use exact cents, nonnegative amounts and `0 <= W <= B`, without a 0.01 tolerance.

| Frozen classification | Routing |
| --- | --- |
| `professional_fee` | Pool `B-W`; explicit nonnegative fixed `referral_amount + company_share_amount + work_compensation_amount = pool`. VAT/WHT excluded; no unexplained remainder or automatic preset. |
| `additional_service`, `reimbursable_expense`, `government_or_court_fee` | Direct company economic base `B`; direct company cash base `B-W`. Professional pool and all three professional split components are zero. |
| `other`, unknown, missing or unsupported | Block; require authoritative review, never description inference. |

Company share means a component of the professional pool, not direct-company
non-professional value. VAT stays company/tax-side; WHT stays company tax credit,
never bank cash or percentage-distributed money. Before splitting, show the pool
as awaiting distribution; after splitting, the cash bridge is:
`cash = VAT + direct_company_cash + referral + company_share + work_compensation`.
`settlement = cash + WHT`. Economic base is not bank balance or net profit.

### Protected UAT: user-supplied values, not Production verification

| Line | Classification | Base | VAT | WHT | Actual cash | Company economic | Company cash | Professional pool |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Translation | `additional_service` | 4,000.00 | 280.00 | 120.00 | 4,160.00 | 4,000.00 | 3,880.00 | 0.00 |
| Professional installment 1 | `professional_fee` | 10,000.00 | 0.00 | 0.00 | 10,000.00 | 0.00 | 0.00 | 10,000.00 |
| Travel | `additional_service` | 4,672.90 | 327.10 | 0.00 | 5,000.00 | 4,672.90 | 4,672.90 | 0.00 |
| Total | | 18,672.90 | 607.10 | 120.00 | 19,160.00 | 8,672.90 | 8,552.90 | 10,000.00 |

Settlement: `18,672.90 + 607.10 = 19,280.00 = 19,160.00 + 120.00`.
Cash bridge: `8,552.90 + 607.10 + 10,000.00 = 19,160.00`.
The user's professional split is unspecified: leave it unentered, never invent
20/40/40. Protect Payment `95E22D0E`, Invoice `VP-IV-202609-000004` and Combined
Draft `D903B209`. Do not save allocation, refresh/issue documents or finalize.

## Lifecycle, guards and future consumers

New evidence tables: `finance_vp_revenue_distributions` and
`finance_vp_revenue_distribution_audit`. One current revision per Payment,
restrictive source/predecessor links, full evidence and append-only audit.
Active Admin alone manages `draft -> reviewed -> finalized`; any current state
can be explicitly `superseded` with acknowledgement/reason. Partner is read-only
under existing Payment visibility. No direct authenticated table mutations or
public/anon/private-helper execution grants; controlled RPCs enforce permissions.

Reviewed/finalized money/source/history cannot be edited; correction creates a
separate successor draft. RPCs use expected identity/version and fresh exact
source/current-044 comparison; stale drafts cannot advance. Idempotent retries
must not append duplicates or bypass authorization, source freshness or version
semantics simply because the action's target status already exists.
Successor creation/retry identifies the latest superseded predecessor and version;
null/null creation is valid only before any distribution history exists.

Additive actual-write guards protect reviewed/finalized evidence, even with no
044 FK: Payment reversal/context/totals; raw/effective reallocation; WHT components;
Invoice snapshots/status/items and old/new parents; effective non-copy tax
corrections; and current 044 creation, changes or supersession. Explicit absence
of an 044 row is a dependency too. Drafts may become stale, never silently current.
Payment/dependency locks and optimistic checks serialize transitions; database
deadlock abort/retry is a limitation, not proof of multi-session test coverage.

Correction order: explicitly supersede distribution, then 044 where required,
then separately authorize upstream correction/reversal subject to existing
guards. Reversed/unsupported corrected sources remain blocked for new review.
No upstream RPC body replacement, history rewrite or automatic money reversal.

No Ledger/Cash/Compensation/document/recipient-payment writes accompany this
foundation. Later consumers need unique immutable distribution/revision/line/
component/consumer identity and linked target IDs with transactional deduplication.
An already-consumed predecessor needs explicit adjustment before a successor can
be consumed. Legacy batch links cannot deduplicate another batch or new domain;
resolve historical coexistence before posting. No amount/name-based backfill.

## Operator artifacts and validation

Migration required: **YES**, now manually applied 045; applied 044 stays unchanged.
Artifact paths: `supabase/migrations/202607180045_add_vp_revenue_distribution_foundation.sql`,
`scripts/sql/preflight_vp_revenue_distribution.sql`,
`scripts/sql/dry_run_vp_revenue_distribution.sql`, and
`scripts/sql/verify_vp_revenue_distribution.sql`.

The preflight, rollback-only dry-run, applied migration and post-apply verifier are
retained operator artifacts. The human apply/verify gate has passed; do not reapply
045 during repository finalization. The agent has not executed Production SQL.

After deployment, the human opens confirmed Payment 95E22D0E and opens
`การจัดสรรรายได้ VP` / `VP Revenue Distribution` for read-only inspection. Verify
settlement 19,280.00, cash 19,160.00, VAT 607.10, WHT credit 120.00, direct company
economic base 8,672.90, direct company cash 8,552.90 and professional pool 10,000.00.
Translation/travel show automatic company routing; only the professional line has
three amount inputs. Switching TH/EN retains local input. Stop before saving,
reviewing or finalizing either distribution or Money Allocation; send screenshots.

Preflight/verifier expose named failed checks, catalog/function differences and
protected hashes; dry-run must show no financial DML outside new-domain evidence.
Legacy row counts are observations, not fixed readiness requirements.

| Local validation | Result |
| --- | --- |
| Full PostgreSQL suite | **121/121 passed**: 14 migration-045 tests and 107 prior regressions. |
| UI/regression suite | **21/21 passed**. |
| SQL/static suite | **11/11 passed**. |
| Targeted ESLint / TypeScript | **PASS / PASS** (`tsc --noEmit`). |
| Production build | **PASS**, Next.js generated 34 static pages; no deployment. |
| Existing migration integrity | All **74 pre-existing migration files through 044** verified SHA-256 unchanged. |
| Arithmetic / whitespace | Exact UAT reconciliation and `git diff --check` passed. |
| Browser | **PASS**: TH/EN at 390/768/1024/1440, no overflow; modal focus/Escape, preserved unsaved inputs, read-only/history/blocked states and controlled retry paths. Synthetic localhost data only, zero external requests. |

PostgreSQL coverage includes exact mixed routing, professional VAT/WHT, unsupported
classification, exact choices, permissions, audit rollback, immutable/source-state
guards, Payment reversal, 044 creation/supersession, real reallocation, issued tax
correction, cross-revision replay, client lineage and operator artifact verification.
Independent review is **closed with no remaining scoped findings**; both reported
defects passed focused regressions. The independent lifecycle/successor probe also
preserved all **49 non-distribution public fixture tables** byte-for-byte.
These results do not attest Production catalog state or performance.
No Production query, apply, UAT mutation or downstream posting was performed.

## Prepared file inventory

Actual feature inventory: **22 files (16 new, 6 modified)**. Paths below combine
each directory with its listed filenames; unrelated pre-existing diagnostics and
migrations are excluded.

| Directory | Files |
| --- | --- |
| `app/finance/payments/` | `[id]/page.tsx`, `money-allocation.ts`, `shared.ts`, `vp-distribution.ts`, `vp-distribution-panel.tsx`, `vp-distribution.module.css` |
| `app/finance/tax-corrections/` | `shared.ts` |
| `lib/i18n/` | `catalog.ts`, `messages/vp-distribution.ts` |
| `scripts/tests/` | `i18n-core-workspaces.test.cjs`, `vp-distribution-artifacts.cjs`, `vp-distribution-browser.cjs`, `vp-distribution-catalog.json`, `vp-distribution-fixture.cjs`, `vp-distribution-postgres.test.cjs`, `vp-distribution-sql-static.test.cjs`, `vp-distribution-ui.test.cjs` |
| `scripts/sql/` | `preflight_vp_revenue_distribution.sql`, `dry_run_vp_revenue_distribution.sql`, `verify_vp_revenue_distribution.sql` |
| `supabase/migrations/` | `202607180045_add_vp_revenue_distribution_foundation.sql` |
| `docs/finance/` | `VP_REVENUE_DISTRIBUTION_FOUNDATION.md` |
