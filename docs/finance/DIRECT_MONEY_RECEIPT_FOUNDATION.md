# Direct Money Receipt Foundation (Migration 047)

Status: the business owner confirmed manual Production apply and post-apply verifier PASS, with empty failed checks, catalog differences and function differences. Reported Direct receipt, Direct audit and Cash rows remain zero. Repository finalization and UI deployment are authorized; no Production UAT or business-data writes are authorized for the implementation agent.

The exact prepared Migration 047 artifact is retained unchanged. SHA-256: `4291cef2272f722f6750d230a0b4f1880b84f2612de26579a2177530a022f579`. Its dry-run embeds the same bytes. Production application is attested by the business owner, not independently queried during finalization.

## Audit and Domain Boundary

Invoice-backed `finance_payments` requires receivable lineage: Draft origin Invoice, effective Invoice allocations, confirmed settlement, WHT basis, Payment document decisions and source-linked cash posting. Migration 044 stores `payment_id` and Invoice-item decomposition. Migration 045 originally required `payment_id` for distribution and source locking; 046 adds the shared formula/recipient evidence. None is a legitimate place to invent an Invoice or Payment for unrelated cash.

`finance_direct_money_receipts` is therefore a separate money-event aggregate, not the customer-facing `finance_receipts` domain. It has no Invoice, Payment, VP-RC/VP-RTI counter, source allocation, or document number. The UUID is an internal record identity. `actual cash + WHT credit = gross received amount`, not Invoice settlement.

At preparation, 046 was the last numbered migration and 047 was unused. Applied migrations 001-046 remain unchanged. Migration 047 is now applied and must not be regenerated or edited.

## Facts and Lifecycle

- Draft creation and editing use one Admin-only atomic save with a caller-generated stable UUID, expected version and exact-input retry protection. Drafts must reconcile before persistence. A changed stale request cannot overwrite another version.
- Payer name, received date, THB amount, supported method and receiving location are mandatory. Client is optional; Case/Advisory linkage requires a matching Client and uses the existing context validator. Bank transfer requires an active master account; Cash/Other requires a named location/custodian. This foundation intentionally supports THB only.
- Reference and optional evidence/slip reference follow the current Payment evidence-metadata pattern. These are identifiers for evidence retained externally, not uploaded/verified binary files. No new Storage bucket, arbitrary URL fetching, signed URL, or file-content immutability claim is introduced.
- Active references within the same receiving context/date and active evidence references have database uniqueness guards. A UUID retry cannot create another event. Unreferenced distinct cash events are not heuristically deduplicated by coincidentally equal amounts.
- Confirm requires explicit acknowledgement and authoritative revalidation. It freezes original event facts, lines, selected payer/client and receiving-bank identity. Confirmation does not recognize accounting revenue, issue documents or post cash.
- Confirmed facts are read-only. Reversal requires reason, acknowledgement, actor and timestamp and preserves original confirmation evidence. It is correction of a record, not an automatic customer refund. No original record or audit is deleted.
- Reviewed/finalized distribution prevents classification or reversal until explicit distribution supersession. Both operations take the same source lock as shared distribution operations.

## Lines, Tax and Classification

Every line has a stable `source_line_id`, description and business reason. Money nature is independent of economic classification, VAT and WHT:

`business_revenue`, `client_money`, `owner_or_partner_funding`, `loan_or_deposit`, `reimbursement_or_pass_through`, `other_non_revenue`, `unclassified`.

Business revenue must use an existing supported classification: `professional_fee`, `additional_service`, `reimbursable_expense` or `government_or_court_fee`. Non-business lines cannot carry a revenue classification. VAT=0, WHT=0, cash payment and absent source documents never infer nature.

The server reuses `calculate_finance_billable_charge_amounts` as a fixed-amount calculator and `finance_vat_treatment` for tax evidence. No unit/quantity semantics are fabricated or stored. The UI reuses `calculateFinanceLineAmounts`, `VatTreatmentInput` and `calculateStructuredWht`. The existing Payment 041 reviewer and Direct lines share the extracted SQL `finance_structured_wht_amount` primitive. The arithmetic is unchanged: exact numeric half-up `round(base * rate / 100, 2)`; rates retain four decimal places. No Payment evidence or source snapshot is rewritten.

WHT applicability must be explicitly selected. Applicable WHT has a stored base/rate and server-calculated amount; non-applicable WHT has null base/rate and zero amount. Base may not exceed before-VAT value. Cash and tax totals reconcile in exact cents, and VAT treatment requires explicit evidence for nonstandard business lines.

Unclassified money can be confirmed as a real cash event, with an explicit warning. It cannot enter revenue distribution or a tax-document decision. Unknown VAT remains unknown, never "non-tax". A controlled classification action records new economic evidence and an audit version without replacing the original confirmed snapshot. It cannot change cash, before-VAT amounts, VAT, WHT or source-line identities. Discovering different financial/tax amounts requires explicit record correction, not a classification edit.

Non-revenue money never becomes professional/company revenue. The initial distribution adapter is conservative: an event containing any non-revenue or unclassified line is blocked as a whole rather than silently distributing only a guessed portion. Multiple fully classified business lines are supported.

## Shared Composition and Distribution

`get_finance_received_money_source(source_type, source_id)` provides a read-only normalized contract:

- `source_type`: `invoice_payment` or `direct_money_receipt`;
- source UUID, source fingerprint/version and evidence;
- actual cash, WHT credit, before-VAT base, VAT, currency and stable line identities;
- source-specific `receivable_settlement` versus `gross_received` semantics;
- blockers and future original-leg identity.

044 remains unchanged and read-only in normal UI. Direct lines produce equivalent read-only composition without creating a 044 Payment row or bringing back editable categorization.

The existing distribution table gains a nullable Direct source FK and an exclusive-source CHECK. Existing Payment FK values and snapshots remain untouched. There is one current distribution per source, append-only revisions and a single shared audit/lifecycle path. Existing Payment RPC signatures are preserved as wrappers; Direct wrappers call the same save/context core. Review/finalize/supersede remain the same RPC and table.

Source-specific validation adapters converge on the extracted `vp_received_line_economics` policy helper, shared amount-choice validator, 046 `vp_formula_calculate` and recipient guard. Direct choices use `source_line_id`, not a disguised `invoice_item_id`. The shared React panel, formula editor, three buckets and multiple-role recipient logic consume both identities. Canonical formula definitions/calculator are unchanged.

Synthetic professional example: base 10,000 + VAT 700 = gross 10,700; WHT base 10,000 at 3% = 300; actual cash 10,400. Professional pool = 9,700. Referral + Company + Work = 9,700. VAT is excluded; WHT remains tax credit. Supported nonprofessional business lines route before-VAT economics directly to Company, net of their WHT cash credit, using the existing policy.

## Future Boundaries

No source Invoice does not remove Receipt/Tax Invoice/Combined obligations. The normalized Direct evidence explicitly says document review is required and automatic issuance is disabled. The Payment-specific Decision Engine is not fed fabricated inputs. Direct-source customer documents need a separately reviewed integration.

Future cashbook consumption must deduplicate `(source_type, source_id, original leg)`. Evidence publishes stable `invoice_payment:<uuid>:original` or `direct_money_receipt:<uuid>:original` identities. No current Cash row or posting reservation is created. A future implementation must map existing Payment-source cash guards to this contract, not post historical sources again. Classification revisions cannot create another original cash leg. Coordinated cash reversal remains future work.

No Compensation batch/allocation, referral payable, lawyer entitlement, payout, Ledger, Revenue Allocation, Cash, Opening Balance or customer document is created. Finalized distribution is evidence only. Legacy Ledger remains operational; no cutover/backfill is performed.

## Permissions and UI

Backend mutation authority is the existing active Admin check; Partner is read-only. Read access follows existing Payment visibility. Tables expose SELECT only under RLS, and internal functions have no browser EXECUTE. The incoming-money nav/list now reflects the existing database Partner read permission; no backend role permissions or Payment mutation permissions are expanded.

The existing Money menu distinguishes Invoice-backed, Direct and Unclassified money. Direct creation is a dedicated page, Draft edits and classification use modals, confirmation/reversal have visible in-app validation and explicit acknowledgement. Current-source facts, composition and audit are read-only after confirmation. TH/EN use the existing catalog; 390/768/1024/1440 layout checks use closed local browser fixtures.

## Retained Operator Workflow

These are the reviewed apply/rehearsal artifacts retained for history. Do not rerun the migration after its confirmed Production application.

1. `scripts/sql/preflight_direct_money_receipt_foundation.sql`: one SELECT statement/result row, exact prerequisite functions, unused namespace, master shapes and protected evidence. Preserve its output.
2. `scripts/sql/dry_run_direct_money_receipt_foundation.sql`: BEGIN, exact embedded candidate, exact verifier and ROLLBACK. No business RPC or synthetic Production rows. It compares protected evidence inside the rehearsal.
3. `supabase/migrations/202607180047_add_direct_money_receipt_foundation.sql`: exact human-applied artifact, now immutable.
4. `scripts/sql/verify_direct_money_receipt_foundation.sql`: one SELECT statement/result row; exact function bodies/signatures/privileges, exact catalogs with differences, zero new domain rows, protected source evidence. Compare pre/post hashes. Global mutable counts are observability only.

SQL manifests are generated from isolated PostgreSQL fixtures and pinned applied source definitions. Catalog drift reports exact expected/actual metadata. Production UAT is not performed by the implementation agent; protected Payment 95E22D0E, Invoice VP-IV-202609-000004, Combined D903B209 and finalized distributions remain untouched.

## Local Validation

The isolated PostgreSQL suite covers professional VAT/WHT, multi-line and multi-role sharing, company routing, all non-revenue natures, unclassified confirmation/classification, exact reconciliation, reference uniqueness, retries/stale versions, immutable source/audit evidence, RLS, finalized-distribution guards and operator rollback. Existing Payment distribution and upstream financial/document regressions run alongside it.

Closed browser fixtures exercise TH/EN at 390/768/1024/1440, field validation/focus, retry identity, busy Draft edit modals, controlled classification, Partner read-only behavior and the same distribution save/review/finalize panel. No browser fixture can request a non-loopback URL. These are synthetic local tests, not Production UAT or a multi-connection concurrency stress test.

Validation at preparation: 275 PostgreSQL/regression tests passed, including 12 Direct tests; 54 focused UI/helper/static regressions passed. The final regenerated operator artifacts also passed all 12 Direct PostgreSQL tests and 12 focused/static tests. Direct browser fixtures produced 40 TH/EN viewport screenshots. Existing Invoice-backed distribution and Finance navigation/list browser suites passed. Targeted ESLint, TypeScript, optimized build and tracked/untracked whitespace checks passed. The sandboxed build stalled; the explicitly approved local build outside the sandbox passed. No Production request was made.

Finalization reran all 275 PostgreSQL/regression tests, 54 focused/static regressions, targeted ESLint, TypeScript and the optimized build successfully. All three closed browser suites passed again. Direct fixtures now also verify reason-plus-acknowledgement reversal at all four widths in both languages, confirmed read-only facts, and exactly one controlled reversal call with no financial-fact edits. No Production UAT action was performed.

After deployment, human UAT starts at Payments -> Record Direct Money Receipt. Inspect the create form, nature choices and reconciliation in TH/EN; stop before saving or confirming any Production record until the business owner approves the test event. Existing protected UAT records are not a test target for this workflow.

## Intended File Inventory

Only these 31 files belong to this implementation; unrelated untracked diagnostics/migrations are excluded.

- `app/finance/direct-money/new/page.tsx`
- `app/finance/direct-money/[id]/page.tsx`
- `app/finance/direct-money/form.tsx`
- `app/finance/direct-money/classification.tsx`
- `app/finance/direct-money/list.tsx`
- `app/finance/direct-money/shared.ts`
- `app/finance/direct-money/direct-money.module.css`
- `app/finance/payments/page.tsx`
- `app/finance/payments/vp-distribution-panel.tsx`
- `app/finance/payments/vp-distribution.ts`
- `app/finance/payments/vp-formula.ts`
- `app/finance/finance-navigation.ts`
- `lib/permissions.ts`
- `lib/i18n/catalog.ts`
- `lib/i18n/messages/direct-money.ts`
- `package.json`
- `package-lock.json` (Lucide icons only)
- `supabase/migrations/202607180047_add_direct_money_receipt_foundation.sql`
- `scripts/sql/preflight_direct_money_receipt_foundation.sql`
- `scripts/sql/dry_run_direct_money_receipt_foundation.sql`
- `scripts/sql/verify_direct_money_receipt_foundation.sql`
- `scripts/tests/direct-money-migration.cjs`
- `scripts/tests/direct-money-artifacts.cjs`
- `scripts/tests/direct-money-catalog.json`
- `scripts/tests/direct-money-postgres.test.cjs`
- `scripts/tests/direct-money-sql-static.test.cjs`
- `scripts/tests/direct-money.test.cjs`
- `scripts/tests/direct-money-browser.cjs`
- `scripts/tests/vp-distribution-ui.test.cjs`
- `scripts/tests/finance-navigation-browser.cjs`
- `docs/finance/DIRECT_MONEY_RECEIPT_FOUNDATION.md`
