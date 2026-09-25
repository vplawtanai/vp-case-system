# Phase 3 — Company Share / Company Statement

Status: implementation candidate; STOP at MANUAL PRODUCTION PREFLIGHT.
No Production SQL, commit, push, deployment or Human UAT was performed.

## Guard and source

- Repository: `/Users/paolawyer/vp-case-app/vp-case-web`, branch `main`.
- Starting HEAD = origin/main = `e68a30f536383738fe37c72dc08948ba2a66af8b`.
- Applied migrations 001–068 and all 28 pre-existing untracked files preserved by SHA-256 comparison.
- Source: `finance_vp_revenue_distributions.status = finalized`, `source_snapshot_json`, `decisions_json` and optional frozen `formula_result.recipients` Company components. Both source IDs, revision and finalization evidence already exist; no new posting storage is needed.

## Architecture and security

Migration `202607180069_add_company_share_statement.sql` adds exactly:

1. `company_statement_frozen_share(jsonb,jsonb)` — immutable private helper. Checks professional-line identity, distinct choices, nonnegative exact-cent frozen Company Share, frozen basis reconciliation, and Company formula components when present. Accepts historical pre-formula v1 amount choices; v2 requires frozen formula evidence. Does not recalculate formulas or derive income from `company_economic`, `company_cash`, VAT, WHT, court fees or pass-through amounts. Unproven evidence returns null and is visibly excluded from income; malformed casts fail closed.
2. `get_finance_company_statement(date,text,text,integer)` — STABLE SECURITY DEFINER read RPC, `search_path=public`, owner `postgres`. Reuses `current_user_can_view_finance_payments()`, identical to the existing Revenue Distribution read permission. No new role capability, policy, RLS or table change. Explicit PUBLIC/anon/authenticated/service_role revokes; helper execution regranted only to service_role, public guarded RPC only to authenticated/service_role.

The only source tables read directly are Revenue Distributions, Payments, Direct Money receipts, issued Receipts, Clients, Invoices, Cases and Advisory Matters, plus the existing effective Payment invoice allocation view. The existing permission helper and its dependencies are reused unchanged. The gate also protects the accepted 067/068 source, payout, cash and tax contracts.

Economic date is the confirmed source's `received_on`, never `finalized_at`. Finalization timestamp remains visible with Bangkok time. Each effective finalized distribution produces at most one positive Company Share row, summing only its proven professional Company components. The existing active-source unique indexes and explicit superseded/newer revision exclusion prevent double counting. A replacement draft produces no income until finalized. Existing settled-correction restrictions are untouched.

v1 retains its originally frozen WHT-reduced basis/share. v2 retains its frozen pre-VAT basis without incoming WHT subtraction. Participant payout status is not consulted. Company Share is identical while participants are unpaid, partially paid or fully paid.

## UI and trace

- New route `/finance/statement/company`; existing shell and `Statement → บริษัท` navigation, with the same read permission as Revenue Distribution.
- Statement rows: received date, Company Share description, receipt/source reference, client/matter, income, expense em dash, details. No fabricated expenses or bank entries.
- Received-month, source and search filters; 50-row pagination.
- Total is computed for **all matching rows before pagination**, separately per currency. It is explicitly a filter total, not a cumulative bank/cash balance.
- Existing DetailModal shows received date, finalization time, effective revision, source reference/type, client/matter, frozen policy and basis. The response retains distribution/source IDs; normal UI does not expose raw UUIDs or JSON.
- “ดูการจัดสรรรายได้” links to the existing source-specific Revenue Distribution detail. Common path: Company → Details → Revenue Distribution (three actions).
- No full bank/cash Statement, expense projection, export system, Tax UX redesign or Phase 4 work.

## Zero-write and concurrency evidence

The candidate contains no DML, posting trigger or posting table and replaces no existing function. The UI calls only the new read RPC. Local tests hash every available Finance/Legacy/tax business table plus source identity tables before/after applying 069 and repeated projection reads. All hashes remain identical, including Cashbook, Payouts, Payables, Reimbursements, Legacy Ledger/compensation and Tax facts/revisions.

Local tests pay participants through the unchanged 068 flow, then prove the Company Statement is identical before payment, after partial payment with explicit outgoing WHT, and after full payment. Those payments occur only in disposable synthetic fixtures.

Repeated/concurrent Promise reads return identical results and do not add rows. PGlite serializes connections: this is **not** an independent-session PostgreSQL race test. No new reservation, number allocation or write transaction exists in 069; one STABLE RPC reads a statement snapshot. Existing active-source unique indexes and source/correction locks remain exact in the protected contract.

## Gates

Candidate SHA-256:
`922922ac27b5eb16819fe1775a31269909f7772c8894f5a531485a9cde238d06`

Authoritative existing object fingerprints come verbatim from the accepted post-068 contract, not synthetic PostgreSQL ACL defaults. Only the two new explicitly secured functions are fingerprinted from local candidate execution. The broader 490 unresolved baseline differences remain unresolved outside this protected surface; none are silently accepted or normalized.

- SELECT-only Preflight: `scripts/sql/preflight_company_share_statement_069.sql` (64,124 bytes / 117 lines).
- Rollback-only Dry-run: `scripts/sql/dry_run_company_share_statement_069.sql` (124,224 bytes / 143 lines).
- SELECT-only Verifier: `scripts/sql/verify_company_share_statement_069.sql` (56,407 bytes / 31 lines).

Preflight checks exact existing definitions/security/catalog/view contracts, candidate bytes, absent 069 targets, v1 reconstruction and v2 basis invariants. It captures current business counts/hashes and returns compact `candidate_sha256`, `manifest_sha256`, `state_sha256`, `historical_rows_sha256` values. This recaptures the actual post-068/UAT baseline rather than asserting old business row hashes.

Dry-run/Verifier templates are generated but **fail closed until the successful 069 Preflight hashes are pinned**. After the operator supplies those compact PASS values, only gate pins/static SQL are regenerated. No JSON/CSV download, baseline transfer, psql, SSL setup or manual conversion is required. Every operator gate is one complete static SQL file. Any SQL error during rehearsal is a failure even if a client continues and shows a later restored-state result.

Offline artifact validation:

```sh
cd /Users/paolawyer/vp-case-app/vp-case-web && node scripts/tests/company-statement-artifacts.cjs
```

Only the following manual Production step is authorized next:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_company_share_statement_069.sql
```

Paste the complete SQL into a new Supabase SQL Editor query, Run, and preserve the compact PASS result. Do not apply or deploy this candidate yet.

## Validation

- 069: 8 DB/gate tests passed; separate contract-capture test passed during artifact generation.
- 067: 14 DB regressions passed (capture-only case skipped).
- 068: 8 DB regressions passed (capture-only case skipped), including Company/Reimbursement cash/bank behavior and General Payables separation.
- 066: 14 DB regressions passed.
- Statement + 067/068 UI: 12 tests passed.
- TH and EN browser smoke at 390, 768, 1024, 1440: passed. Includes 53-row pagination/full-filter total, keyboard modal closure, source links, Thai/English search, month/source filters, long matters, excluded/error states and blocked non-loopback requests.
- Targeted ESLint: no errors/warnings. `npx tsc --noEmit`: passed. `npm run build`: passed. `git diff --check` plus new-file whitespace check: passed.
- Synthetic screenshots (not Production UAT): `/private/var/folders/jq/3xy92bf51ksff5n692600n9c0000gn/T/vp-company-statement-069-ug6dQY/`.

## Exact implementation/change manifest

Modified existing files:

1. `app/finance/FinanceSidebar.tsx`
2. `app/finance/finance-navigation.ts`
3. `lib/i18n/catalog.ts`

Added files:

4. `app/finance/statement/company/page.tsx`
5. `app/finance/statement/company/workspace.tsx`
6. `app/finance/statement/company/statement.module.css`
7. `lib/i18n/messages/company-statement.ts`
8. `supabase/migrations/202607180069_add_company_share_statement.sql`
9. `scripts/sql/preflight_company_share_statement_069.sql`
10. `scripts/sql/dry_run_company_share_statement_069.sql`
11. `scripts/sql/verify_company_share_statement_069.sql`
12. `scripts/tests/company-statement-approved-hashes.json`
13. `scripts/tests/company-statement-artifacts.cjs`
14. `scripts/tests/company-statement-contract.cjs`
15. `scripts/tests/company-statement-contract.json`
16. `scripts/tests/company-statement-fixture.json`
17. `scripts/tests/company-statement-postgres.test.cjs`
18. `scripts/tests/company-statement-ui.test.cjs`
19. `scripts/tests/company-statement-browser.cjs`
20. `docs/company-statement-069.md`

## Deferred Human UAT

Only after all manual gates and a separately authorized release: Finance → Statement → Company. Filter September 2026, find `VP-RC-202609-000001`, expect one Company Share of 934.58 THB dated 5 September 2026, and trace to its finalized distribution. Confirm no extra cash, payout, payable, Legacy or tax entry. This Production expectation has not been asserted by automated mutation or Human UAT on the user's behalf.
