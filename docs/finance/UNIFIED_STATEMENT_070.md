# Phase 4 — Unified Statement, expense economics and transfers

Status: candidate implementation complete; stop at manual Production SELECT-only Preflight. No Production SQL, staging, commit, push or deploy performed. Migration 070 is not applied by this task.

## Project guard

Repository: `/Users/paolawyer/vp-case-app/vp-case-web`, branch `main`.
Starting `HEAD = origin/main = 77ad96eceeee08573cf2fa9b4ad44018346a2815`.
All 99 pre-existing migration files and the 28 pre-existing untracked files were SHA-256 preserved (127 distinct paths, including unrelated SQL evidence). Migrations 001–069 are immutable. The approved 069 hash is `922922ac27b5eb16819fe1775a31269909f7772c8894f5a531485a9cde238d06`.

## Proven source contracts and economic decisions

The existing indivisible unit is one `finance_expenses.id` (one item within a multi-item request). The latest `finance_expense_tax_reviews` revision describes the whole unit, `finance_expense_settlements` gives the approved obligation, and `finance_payout_allocations` links settlement to one confirmed `finance_payouts` and its confirmed Cashbook outflow. Migration 060 establishes reviewed Company Purchase gross/recipient/tax decisions; 061 establishes approved claimant reimbursement; 063 records actual company bank/cash outflow; 065 determines authoritative VAT validity. None is replaced.

New append-only `finance_expense_economic_decisions` records the explicit Finance decision, expense ID, revision/previous revision, attributable approved recoverable VAT, source context snapshot, exact retry payload, actor, timestamp and reason. Each item can be COMPANY_COST or CLIENT_RECOVERABLE. Mixed burdens require separate existing expense items. Creator inputs, Client/Matter metadata and category meanings are unchanged.

No decision means UNCLASSIFIED. There is no migration backfill and no category/client/Payable heuristic. Accepted historical items expose a collapsed controlled classification/correction panel in their existing review/detail screen. A stale source/VAT/settlement snapshot removes the expense from the Company projection until reconfirmed. Earlier decisions and original money/tax facts are retained.

New normal approval uses `review_finance_expense_with_economics`, which composes the unchanged 060/061 approval and the new decision in one transaction. Rejection remains the existing rejection. Exact retries preserve one decision. Older callers remain compatible and create no implicit classification.

Full approval carries the existing eligible VAT. Reduced reimbursement with source VAT requires an explicit zero or specified attributable VAT; no prorating and no automatic full-document VAT deduction. Amount must be an exact cent, nonnegative, no greater than approved gross or original authoritative recoverable VAT. Ineligible VAT permits zero only. The UI asks for this additional choice only on the reduced-VAT exception path.

For an unresolved legacy VAT source, approval can still complete with an explicit burden but NULL approved VAT. NULL is not treated as zero. The item is excluded from Company Statement until the existing tax-evidence correction is completed and Finance reconfirms the economic decision. Tax Position remains unchanged by economic classification.

Company expense = effective settled allocation gross − approved attributable recoverable VAT. Outgoing WHT never reduces this expense. Reimbursement uses approved gross, not original requested gross. Company cost 300 / VAT 19.63 / WHT 8.41 therefore gives Company expense 280.37 and actual bank outflow 291.59. Later WHT remittance produces no second expense. CLIENT_RECOVERABLE, unclassified, unpaid, rejected/cancelled/reversed/waived, participant payout, tax-only movements and transfers are excluded.

## Statement and navigation

One shared `UnifiedStatement` renders Company income/expense/net or account opening/inflow/outflow/closing. Company income copies the 069 source/projection CTEs without changing frozen v1/v2 amounts, received dates, revision effectiveness or source links. Existing 069 functions and UI detail renderer remain intact.

Existing masters `finance_bank_accounts` / `finance_cash_locations`, authorized `finance_treasury_accounts`, effective `finance_account_opening_balances`, and confirmed `finance_cash_transactions` remain money truth. No Statement posting table exists. Account Statement enriches source references with issued receipts, client/matter, expense, payout, tax, confirmation and transfer counterpart. Details reuse the VP modal, with source links and no raw JSON.

Money → Statement → Company + dynamic active bank/cash accounts. No hardcoded KBANK/KTB/BAY IDs/routes. `/finance/statement` includes inactive-account history and secondary authorized opening/reconciliation tools. `/finance/statement/account/[kind]/[id]` handles every authorized master. The old `/finance/treasury` route remains intact; its duplicate normal menu is removed. Controlled transfers have a separate route.

Balances are computed in PostgreSQL over the complete confirmed authorized account history before filtering/search/pagination. The stable order is occurred_at, confirmed_at, ID; the UI receives at most 50 rows. Opening and period totals are independent of search/type filters. Backdated rows affect every later balance. Original/reversal cash evidence remains visible according to existing lifecycle truth; drafts/cancelled cash is not counted. Before the effective opening cutoff, balances are explicitly unavailable rather than fabricated; historical rows remain accessible.

The scoped EXPLAIN ANALYZE fixture (56 relevant rows) used the existing `idx_finance_cash_transactions_status_date`, Incremental Sort and WindowAgg; no per-row balance subquery. Observed local execution: 0.321 ms (synthetic, not a Production benchmark). No speculative index was added. Production-scale performance remains subject to later observation.

Visuals follow the Phase 4 reference: existing VP shell, compact summary cards, date/type/search row, statement table, mobile cards, modal source trace. TH/EN; no new visual subsystem. Creator forms, Tax/Treasury calculation screens and Revenue Distribution layouts are not redesigned.

## Transfer architecture and security

`finance_treasury_transfers` is one immutable confirmed actual-transfer source, and `finance_treasury_transfer_legs` bridges it to the existing Cashbook. Confirmation inserts exactly one outflow and one inflow with equal amounts/date/actor/time and shared transfer ID. Existing source columns and existing Cashbook rows are unchanged.

`confirm_finance_treasury_transfer` validates acknowledgement, both authorized/active masters, different accounts, positive exact-cent THB amount, valid nonfuture date, and confirmed openings with post-cutoff dates. It locks the operation ID, existing THB cash-cutover key, masters and opening records. Exact retries return the original ID; a different payload/actor with that ID fails. A new operation ID represents a separate acknowledged actual transfer.

Constraints: transfer PK, unique generated reference, `(transfer_id,direction)` PK, globally unique cash-transaction linkage, and deferred transfer/leg/Cashbook integrity triggers. Both matching cash legs and confirmation audit must exist at commit. Failure on the second leg rolls back source, first leg, bridge and audit. Independent PostgreSQL 18 sessions proved duplicate retry = one pair, conflicting payload = one winner, opposite-direction transfers = two complete legitimate pairs without deadlock. Distinct backend PIDs were asserted. The disposable private Unix-socket cluster was stopped afterward.

Source enrichment also checks the existing source permissions: an account-only reader retains authorized Cashbook facts without private expense/customer/matter details or inaccessible source links.

All three new tables: owner postgres, RLS enabled, no permissive policies, no PUBLIC/anon/authenticated direct privileges, service_role SELECT only. Eleven new functions pin owner postgres/search_path public and remove default PUBLIC/anon execution. Only seven authorized RPCs grant authenticated EXECUTE; four helpers stay private. Existing account/source permissions are checked in SECURITY DEFINER RPCs. Existing object ACLs/RLS are preserved; no old function is replaced.

New RPCs:
- `get_finance_expense_economics(uuid)`
- `classify_finance_expense(uuid,uuid,uuid,text,numeric,text)`
- `review_finance_expense_with_economics(text,uuid,uuid,integer,boolean,jsonb,numeric,text,text,numeric)`
- `get_finance_unified_company_statement(date,date,text,text,integer)`
- `get_finance_statement_accounts()`
- `get_finance_account_statement(uuid,uuid,date,date,text,text,integer)`
- `confirm_finance_treasury_transfer(uuid,uuid,uuid,uuid,uuid,numeric,date,text,boolean)`

Private helpers: `statement_expense_context`, `statement_company_income`, `statement_transfer_allowed`, `statement_transfer_integrity`.

No Legacy writes, Company ledger writes, new expense posting, tax fact/revision/remittance creation, Payable, Reimbursement or participant Payout is caused by Statement reads/classification/transfers. Existing approval still creates its existing obligation; the wrapper does not post cash. The only new cash writes are the two authoritative transfer legs. General Payables separation from 068 remains unchanged.

## Local validation and evidence

- 070 disposable DB tests (13 passed; optional capture test run separately): expense classifications, full/reduced/no/ineligible VAT, boundaries, WHT, historical/no heuristic behavior, legacy unresolved VAT, correction invalidation, approval retry/rejection, Payment/Direct/participant/remittance cash, account authorization, inactive history, balances/search/pagination/backdating, failure halfway, exact transfer retry, reversed/ineffective read evidence and static gates.
- Gate tests adapt expectations only in disposable fixtures: before/after exactness, wrong pins, function ACL tamper, historical-row tamper and complete rollback. Synthetic ACLs are never exported as existing Production truth.
- 066–069 DB regressions: 44 passed, 3 optional capture tests skipped. Covers existing document issuance, v1/v2 policy, Payment/Direct distributions, payout/Cashbook separation, 069 frozen share/date/source semantics. Exact 069 income CTE preservation also has a static test. No Production row was read or changed for UAT.
- Seven UI/static regression tests; 24 existing Company Purchase browser scenarios and 31 existing Reimbursement scenarios (create, linkage, draft reopen, approval/rejection and exact retry) passed; TH/EN live browser harness at 390/768/1024/1440 for Company, bank, source modal, transfer, economic VAT choice; search/pagination, dynamic navigation, inactive exclusion and double-click/lost-response identical-request retry. Synthetic adapter blocks every external request.
- Targeted ESLint, TypeScript, production build and diff/whitespace checks. All passed. The sandboxed Next build was interrupted after stalling; the approved local build outside the sandbox passed.

Known limits: transfer correction/reversal is deliberately deferred; confirmed transfers cannot be edited/deleted or singly reversed. Export is deferred (no clean shared export utility was found, no package added). Balance before the authoritative opening cutoff is unknown. Historical expenses require an explicit Finance decision; ambiguous VAT must be resolved through the existing tax-evidence workflow before economic inclusion. No Legacy cutover or statutory accounting implementation.

## Dependency-scoped manual gate

The manifest starts from the accepted post-069 contract, adds the schema-qualified call graph and referenced tables, and reconciles extra definitions/structure against accepted 066 post-apply/corrected Preflight evidence and unchanged repository history. Existing captured Production ACLs are frozen, never replaced with PGlite default privileges. The 021 Payment Evidence index/trigger/RLS omitted by the narrow fixture is checked against its original migration and retained exactly. 070 changes only one existing Cashbook constraint-trigger entry; all columns, policies, ACLs and prior triggers stay exact. Broader 490 unresolved differences remain documented, not silently accepted.

Preflight is SELECT-only. It returns candidate/manifest/state/historical-row hashes and exact scoped function/catalog differences. It embeds exact candidate bytes only as a string for SHA verification; it does not execute them. Historical protection hashes the existing business tables (including Tax, Payout, Cashbook, expenses and Legacy) without exporting rows. Target 070 objects must be absent. Existing v1/v2 checks must pass.

No approved Production 070 hashes exist yet. The generated rollback/verifier templates deliberately fail closed with `REQUIRES_PRODUCTION_PREFLIGHT_PASS`. After the operator returns PASS hashes, the next gate can be pinned into one static SQL file; no JSON/CSV transfer is needed. Do not run those later templates now.

Next action only:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_unified_statement_070.sql
```

Paste into Supabase SQL Editor manually and return the complete PASS/hash result. Stop on any dependency difference. Do not apply automatically.

## Exact intended implementation manifest

- `app/finance/FinanceSidebar.tsx`
- `app/finance/expenses/claim-review.tsx`
- `app/finance/expenses/company-review.tsx`
- `app/finance/expenses/economics.tsx`
- `app/finance/expenses/purchase-request-review.tsx`
- `app/finance/finance-navigation.ts`
- `app/finance/statement/account/[kind]/[id]/page.tsx`
- `app/finance/statement/company/page.tsx`
- `app/finance/statement/navigation.tsx`
- `app/finance/statement/page.tsx`
- `app/finance/statement/shared.ts`
- `app/finance/statement/statement.module.css`
- `app/finance/statement/transfers/page.tsx`
- `app/finance/statement/workspace.tsx`
- `docs/finance/UNIFIED_STATEMENT_070.md`
- `lib/i18n/catalog.ts`
- `lib/i18n/messages/statement.ts`
- `scripts/sql/dry_run_unified_statement_070.sql`
- `scripts/sql/preflight_unified_statement_070.sql`
- `scripts/sql/verify_unified_statement_070.sql`
- `scripts/tests/company-review-modal.test.cjs`
- `scripts/tests/employee-reimbursement-browser.cjs`
- `scripts/tests/expense-request-browser.cjs`
- `scripts/tests/purchase-request-browser.cjs`
- `scripts/tests/unified-statement-approved-hashes.json`
- `scripts/tests/unified-statement-artifacts.cjs`
- `scripts/tests/unified-statement-browser.cjs`
- `scripts/tests/unified-statement-concurrency.test.cjs`
- `scripts/tests/unified-statement-contract.cjs`
- `scripts/tests/unified-statement-contract.json`
- `scripts/tests/unified-statement-fixture.json`
- `scripts/tests/unified-statement-postgres.test.cjs`
- `scripts/tests/unified-statement-ui.test.cjs`
- `supabase/migrations/202607180070_add_unified_statement_and_transfers.sql`

Candidate SHA-256: `6b9bab9c80730d659ad5e06d0b227872aaea44782d1a789b7ec0be1add73ad96`.
