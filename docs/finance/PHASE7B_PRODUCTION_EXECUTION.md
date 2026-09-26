# Phase 7B — Production cleanup execution record

Execution date: **2026-09-26** (Asia/Bangkok). Record the facts of this execution without overwriting them for later operations; use a separate dated record for subsequent changes.

Repository: `/Users/paolawyer/vp-case-app/vp-case-web`, branch `main`.
Application baseline: `81c90a5e8632d3c087284d3a9634a38335032922` (HEAD and local origin/main at closure start).
Production: https://vp-case-system.vercel.app/

## Evidence and execution boundary

The Production gate results below were supplied and approved by the user after manual execution. Codex did not execute the Production cleanup, rerun SQL, independently recapture the database, or exercise business writes during this closure. The authenticated Production browser observations below are separate, directly observed evidence; they are not an HTTP-status-only smoke or a database hash recapture.

| Gate | Approved result |
| --- | --- |
| Preflight | PASS; `gate_pass=true`; no retained Legacy reference blockers |
| Rollback-only Dry-run | PASS; `gate_pass=true`, `legacy_unchanged=true`, `rollback_verified=true`, `production_changes_committed=false` |
| Apply | PASS; `gate_pass=true`, `cleanup_pass=true`, `failed_checks=[]`, `transaction_changes_committed=true`, `schema_security_unchanged=true`, `legacy_shared_config_unchanged=true` |
| Post-cleanup Verifier | PASS; `gate_pass=true`, `failed_checks=[]`, `historical_rows_unchanged=true`; all Phase 7B New Finance purge targets zero |

| Approved identity | SHA-256 |
| --- | --- |
| Manifest | `a60f80f6436d0cd7fcad2944f5e859775011648d44d2415f9d980a2def107e1b` |
| Pre-cleanup state | `48cae7e4af2a1144ae2de9c0c6fb3a6851757b87ed7b6a48ff38d570b19e989b` |
| Post-cleanup state | `e929e4cf6a9548de14853baeb117220b622373130ac2774c02946ba26933b19d` |
| Preserved rows | `ae1724585c19d6b207476e1cbd3b3b8b6e878c19b219eb052c77211f196a5bd0` |
| Catalog/security | `b7185e5e607218112b85a54ea005df2bfb84550c6a809ad626acc27265af2293` |
| PostgreSQL sequences | `f45149c3e1a98d9301f26907badbaad3d26a84f5d10aa3538dac281bb7834ded` |

The premature unbound Dry-run failed with `PREFLIGHT_PASS_HASHES_REQUIRED` / `ROLLBACK_STATE_MISMATCH`, committed nothing and returned the same approved pre-cleanup state. That was a missing approval binding, not corruption. Gates 2–4 were then bound to the exact PASS Preflight. The archived SQL retains those pins and its original fail-closed checks.

## Exact Legacy preservation

| Table | Preserved rows | Preserved row SHA-256 |
| --- | ---: | --- |
| finance_company_ledger | 356 | `9ad45c71555f78e480398bb0f84561676fc20eb5066f761e9ff87e24ff39acce` |
| finance_compensation_allocations | 139 | `254ebc1f8bca193425f194d8d03e018070b31a27fc95b596ca4c83fdcaad3dbe` |
| finance_compensation_batches | 38 | `230fcddfd491457b35c26e9765d46366f8395233edcf377b41c09d937a2a0d05` |
| finance_expense_claims | 274 | `0b86ab890eb01c79d6e49379059cc0a9ef770238cd6e0d389036e14c8e6faa88` |

All 91 complete-table New Finance UAT targets and the two scoped audit/counter targets were verified clean by the manual gate. Finance counter rows for `QT`, `fee_agreement`, `invoice`, `receipt`, `tax_invoice`, `receipt_tax_invoice`, `credit_note`, `debit_note` were reset by removing their approved rows; numbering profiles/functions and non-Finance counters were preserved. No document was issued to test numbering in Production.

Storage files/objects/buckets were untouched. Shared Clients, Cases, Advisory, Users, other shared core, retained audit rows, bank/cash masters, configuration, templates, permissions, RLS, functions, trigger modes and sequences were preserved. UAT objects may remain unreferenced in storage; storage cleanup is not part of this record. The broader 490 catalog differences remain unresolved outside scope and are not accepted by this closure.

## Authenticated Production UI smoke

Observed on 2026-09-26 using the existing signed-in Chrome session, fresh page navigation, rendered accessibility/DOM state and representative screenshots. No credentials, private transaction details or account numbers are committed in this record. No create, edit, pay, issue, classify, void, transfer, opening-balance or filing submission was performed.

| Route / view | Directly observed result |
| --- | --- |
| `/finance/quotations` | Empty quotation table; normal create action |
| `/finance/fee-agreements` | 0 of 0 agreements; normal empty-state copy |
| `/finance/billable-charges` | All status badges 0; empty list |
| `/finance/invoices` | No invoices; filters/create link render |
| `/finance/payments` | No received-money records, including Payment and Direct Money; pagination disabled |
| `/finance/receipts` | No receipts; page 1 and disabled pagination |
| `/finance/combined-documents` | No combined documents; normal explanatory empty state |
| `/finance/tax-invoices` | No tax invoices |
| `/finance/revenue-distribution` | All four summary counts and bases zero; no rows |
| `/finance/payables` | 0.00 THB, 0 recipients, 0 waiting items; no payable groups |
| `/finance/expenses` | All request/item counts and amounts zero; no Company Purchase requests |
| `/finance/expenses/claims` | All counts/amounts zero; normal claim empty-state copy/actions |
| `/finance/statement` | External in/out and transfers 0.00; 0 cash activities; four account masters remain. Balances show unavailable, not a fabricated zero, because opening balances are absent |
| `/finance/statement/account/bank/[KBANK id]` | No cash rows; inflow/outflow 0.00; opening/ending balances unavailable |
| `/finance/statement/account/cash/[office cash id]` | Same empty cash statement and absent opening |
| `/finance/statement/opening-balances` | BAY, KBANK, KTB and office cash each explicitly have no opening balance |
| `/finance/statement/transfers` | Account masters selectable; blank transfer form and unchecked acknowledgement; no submission |
| `/finance/tax-position` and `/finance/tax-position/filings` | August and September tax-period VAT output/input/net, outgoing WHT and incoming WHT credit all 0.00. September Input VAT document modal has no records; no pending-input queue |
| Tax monthly history / year 2026 | 12-month history renders; all tax amounts zero; annual totals zero; 0/12 filings complete. Existing calendar-derived pending/future statuses remain; they are not retained UAT filing records |
| `/finance/overview` | No receivables, payables, participant liabilities, distribution basis, cash activity or source rows. Economic totals and tax amounts zero. Only expected missing-opening attention remains (4 accounts) |

Payout, document-correction and individual document detail routes require source IDs; no fake or deleted ID was used and no new transaction was created. Their list/entry surfaces were checked through Payables, Revenue Distribution and document registers. Amount checks concern the visible filters/periods; global emptiness is established by the user-approved database verifier, not inferred solely from list filters.

No crash, FK/reference error, stale UAT row after fresh navigation, broken count, NaN or undefined was observed in the checked views. An already-open pre-cleanup agreement tab initially retained old in-memory rows; a fresh authenticated navigation showed 0/0. Reload pre-cleanup tabs before use; this did not indicate persisted UAT rows.

### Legacy page observations

- `/finance/expense-claims`: 274 historical rows rendered (275 table rows including header); 12 approved and 256 paid displayed, with other historical statuses retained. Existing create/action controls remain visible; none was used.
- `/finance/compensation`: September historical data visible (1 finalized and 4 posted batches in the month; existing participant summaries). Create/draft controls remain present; none was used. Month-filtered UI counts are not the total preserved batch/allocation counts above.
- `/finance/ledger`: September active filter displays 82 historical entries and existing bank summaries. Create/edit/void controls remain present; none was used. This is a historical Ledger view, not independent evidence of actual bank balances.

All three Legacy pages loaded populated history without a cleanup-related reference error. Legacy write access intentionally remains active; no read-only cutover or permission change was introduced or tested with a write.

### Responsive and language spot-check

Thai desktop pages passed; English desktop Reimbursement empty state passed. Thai and English Reimbursement were visually checked at an actual **390 CSS-pixel** viewport: `innerWidth=390`, document width 390, no horizontal overflow, zero summary counts, readable filters and empty-state actions. This was a representative smoke, not the full Phase 6 responsive matrix. Browser language was restored to Thai, the temporary viewport override reset and the smoke tab closed.

## Repository validation and archived files

Phase 7A/7B tests: **8/8 PASS, none skipped**, including real isolated PostgreSQL 18 fixture runs. Read-only audit, complete table coverage, exact approved-pin generation, stale/missing-baseline rejection, 303-edge FK graph, protected Legacy/shared/config rows, rollback restoration, trigger-mode restoration, post-delete failure recovery and counter reset behavior passed. Production-bound gates reject the unrelated local fixture; successful local cleanup tests use local-only approvals in temporary output directories.

Validation command (local synthetic fixture only):

```sh
env PHASE7A_LOCAL_FIXTURE=1 PHASE7B_LOCAL_FIXTURE=1 node --test scripts/tests/finance-cutover-phase7-audit.test.cjs scripts/tests/finance-phase7b-cleanup.test.cjs
```

SQL safety assertions and `git diff --check` passed. All 98 tracked migration files, including Finance migrations 001–071, and unrelated pre-existing files match the closure-start guard. No Migration 072. No application/runtime change, so no application build or Vercel deployment is part of this closure. Commit/push scope is exactly these 14 evidence files:

1. `docs/finance/PHASE7A_DATA_CLASSIFICATION.json`
2. `docs/finance/PHASE7A_CUTOVER_AUDIT.md`
3. `docs/finance/PHASE7B_CLEANUP_MANIFEST.json`
4. `docs/finance/PHASE7B_CLEANUP_PACKAGE.md`
5. `docs/finance/PHASE7B_PRODUCTION_EXECUTION.md`
6. `scripts/sql/audit_finance_cutover_phase7.sql`
7. `scripts/sql/preflight_finance_phase7b_cleanup.sql`
8. `scripts/sql/dryrun_finance_phase7b_cleanup.sql`
9. `scripts/sql/apply_finance_phase7b_cleanup.sql`
10. `scripts/sql/verify_finance_phase7b_cleanup.sql`
11. `scripts/tests/finance-cutover-phase7-audit.test.cjs`
12. `scripts/tests/finance-phase7b-artifacts.py`
13. `scripts/tests/finance-phase7b-cleanup.test.cjs`
14. `scripts/tests/fixtures/finance-phase7b-fk-fixture.json`

## Closure and Phase 7C boundary

**New Finance: CLEAN / READY FOR REAL DATA. Legacy: REAL DATA PRESERVED / STILL OPERATIONAL.** The UI smoke has no outstanding access blocker and requires no replacement Human UAT just to verify these empty/history pages.

**Phase 7C readiness: READY for separately authorized cutover planning.** Phase 7C has NOT been executed. This is not approval for exclusive New Finance go-live: the cutover date/instant, treatment of outstanding Legacy obligations and independently reconciled real bank/cash opening balances still require explicit decisions. Real Opening Balances have NOT been entered. Legacy is NOT read-only. No real transaction or new opening was created during closure; no Production SQL was executed and no deployment was initiated by this task.
