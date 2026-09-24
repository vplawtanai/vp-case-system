# Revenue Distribution Phase 1 — candidate 067

Status: **Production manual migration gate COMPLETE; Phase 1 release authorized.** The operator reported manual Apply and final Post-Apply Verifier PASS, with exact approved baseline, historical rows unchanged, exact applied state, and empty function/catalog/object differences. Migration 067 must not be reapplied during release.

Repository: `/Users/paolawyer/vp-case-app/vp-case-web`, branch `main`, starting HEAD `04308572c5cc104a53dc3750966f83c3adc244b0`.

Candidate: `supabase/migrations/202607180067_add_revenue_distribution_workspace.sql`

SHA-256: `7abd546c20e0a5e7d8fc14e72bfbefd0f4349617ead54f1bb51a8e15d79e5589`

## Policy and transaction boundary

The existing canonical Payment/Direct Money evidence builders remain authoritative. A narrow policy projection changes only proven professional lines: v2 uses their normalized base before VAT, without subtracting incoming WHT. Base 10,000 + VAT 700 − incoming WHT 300 still means actual cash 10,400, but the distribution basis is 10,000. v1 remains 9,700 for that example.

Existing active v1 drafts, reviewed and finalized distributions retain v1. Historical snapshots, audits, entitlements and payouts are never revalued or backfilled. An explicit, already-supported supersession permits a new v2 revision; settled distributions remain locked by the existing payout guard. Unknown/non-revenue classifications and partial-line coverage remain blocked. Existing deterministic non-professional company routing is unchanged and disclosed separately from the professional formula basis.

067 adds no tables, columns, triggers, policies or data migration. It replaces only `vp_received_source(uuid,uuid)` and `vp_received_frozen(jsonb)` for policy dispatch. It adds:

- `vp_distribution_policy(jsonb,text)` — pure versioned projection.
- `vp_distribution_workspace_row(text,uuid)` — shared source/status read projection.
- `get_finance_revenue_distribution_workspace(date,text,text,text,integer)` — filtered, paginated work queue and currency-separated summaries.
- `get_finance_revenue_distribution_detail(text,uuid)` — existing formula context plus source display facts.
- `confirm_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text,boolean)` — atomic common-path confirmation.

Confirmation reuses existing save/review/finalize functions, immutable source checks, formula recomputation, audit versions and entitlement triggers in one transaction. Failure rolls all intermediate writes back. An identical immediate retry returns the same finalized distribution. Stale or conflicting requests fail. Only the existing New Finance entitlement rights may materialize; company share stays inside the frozen distribution. No payout, Cashbook, Treasury, Tax, Company Statement or Legacy posting is added.

Read permissions remain the existing Payment-view contract. Changes require `money_allocation_admin()` (active Admin). New functions are owned by `postgres`; public/anon/authenticated/service_role default privileges are explicitly revoked. Only the three public workspace/confirm RPCs grant authenticated EXECUTE. The pure policy helper grants service_role EXECUTE to preserve the existing service_role → invoker `vp_received_frozen` call chain. Other private helper access stays denied. Existing helper ownership/ACL/search_path/security-definer settings are preserved exactly.

## Workspace and design translation

The primary Income menu is after Payments and before receiving documents. `/finance/revenue-distribution` combines confirmed Payment and Direct Money without fabricating either source. Compact cards and tabs distinguish pending, unpaid, partially paid and paid records; history preserves older revisions. KPI amounts are explicitly labelled distribution basis, not promised cash payouts. A finalized company-only distribution says there are no individual shares due rather than claiming a payment happened.

Filters support month, source, status and reference/client/Case/Advisory search. Issued receipt numbers are shown when available, while the original source reference remains searchable. Actual cash and distribution basis have separate columns. Summaries are computed before server pagination, grouped by currency; unresolved bases are not invented.

The detail page follows the references' source/formula/summary composition: read-only source facts and prominent basis left; the existing formula/identity editor and exact recipient totals centre; reconciliation and Save Draft/Confirm right. The existing VP shell, branding, controls and TH/EN messages are retained. Scoped CSS compacts the shared editor only in this workspace. Narrow screens stack panels and turn list rows into readable cards. Technical evidence/history remains collapsed. Invalid edits do not keep showing an old saved allocation as a valid new total.

Common path changes from Open → Save → Review → Finalize (plus acknowledgements) to Open → choose/check formula and participants → Confirm. This is three main actions, with participant selections as needed; Save Draft is optional. No payout controls are present. Existing source correction controls and old modules remain intact.

## Gate provenance and scope

The exact function/table lists and hashes are in `scripts/tests/revenue-distribution-contract.json`:

- 51 function names, including the five new functions and all transitive canonical-source/formula/confirmation/materialization dependencies, plus the 066 Direct document source builder.
- 25 required relations, including exact columns, constraints, indexes, RLS, policies, triggers, ACL/effective privileges and view definitions/options.
- 105 protected business tables, with full-row count/SHA-256 pairs, including documents, tax, payouts, Cashbook, expenses, Legacy compensation/company ledger, profiles and clients. No 066 source columns are stripped from row hashes.

Expected post-066 state is reconstructed offline from the approved 066 baseline (`3f33c39290834b7bcdcd436b0af957422b400e06e626b3d07d3952569e1e588e`), its exact accepted post-apply function/catalog delta and the operator-confirmed completed 066 gate. All scoped pre-existing function definitions, owners, security-definer flags and search_path settings also match the repository-built post-066 definitions. Synthetic PostgreSQL default permissions are **not** used as Production truth. Captured existing ACLs are pinned and preserved; this is not a claim that every broader historical difference has been accepted.

The broader **490 unresolved differences remain unresolved**. They are not embedded or silently accepted. Any mismatch within this dependency scope causes failure. 067 does not alter any existing table/security contract or unrelated function.

Preflight captures **fresh** protected row hashes when the operator runs it; it does not assume business data stayed frozen since 066. It also checks every existing v1 snapshot reconstructs under its original policy. The rollback rehearsal uses that approved baseline, locks protected tables briefly, executes the exact candidate bytes, asserts only the intended function delta and unchanged business rows/security, rolls back, and reads the restored state independently. Any SQL error is a failed gate; execute the complete file without continuing past an error. Post-Apply is SELECT-only, comparing the same scoped contract and historical rows.

The reviewed static gates are self-contained and pin the approved candidate, manifest and Production state hashes. They require no JSON/CSV transfer. The SELECT-only verifier normalizes only the five new/two replaced function entries in memory, independently checks their exact installed definitions/security, and compares all remaining scoped state and protected row hashes to the approved state.

- Approved state SHA-256: `0638051f9a8422a4930bea2a0f1a97aa190b42c2cdf204a556b1809335336448`.
- Approved manifest SHA-256: `5e606ae7149380dd546cd03f1217f874935b90395c67a01ba117e997daa524c4`.
- Static rollback rehearsal: 137,793 bytes / 258 lines.
- Static SELECT-only verifier: 99,639 bytes / 233 lines.

The offline artifact validator checks the exact approved static SQL bytes, unchanged candidate and prior migration hashes. Its `--dry-run` and `--verify` modes only print the preserved files; they never execute SQL. The old parameterized SQL helpers are retained for disposable local regression fixtures, not for Production recapture.

## Completed manual gate evidence

The operator confirmed `gate_pass = true`, `failed_checks = []`, `exact_approved_baseline_matched = true`, `historical_rows_unchanged = true`, `applied_state_exact = true`, and empty function/catalog/object differences. The candidate hash remains the one recorded above. The 490 broader differences stay documented outside 067 scope. No Production SQL or business mutation is part of release validation or deployment.

## Validation and concurrency

Targeted database tests cover Payment and Direct no-VAT/VAT/WHT, inclusive/exclusive normalization, mixed routing, unsupported/partial evidence, historical reviewed and paid v1, explicit v1→v2 successor, exact-cent multi-role totals, atomic audit failure, permissions, duplicate creates/confirms/retries, stale versions, no duplicate rights, no money/Tax/Legacy side effects, and compact gate rollback/security-mismatch detection. The existing 066 Receipt/Tax/Combined issuance and correction tests pass. UI/formula/document regression tests and loopback TH/EN browser checks cover both sources, draft/confirm/read-only, filters, stale recovery, blocked sources, v1 display, and 390/768/1024/1440 layouts. Browser screenshots use clearly synthetic local fixtures; no Production UAT was performed.

Release validation: 52 database regressions PASS (067: 14, 066: 14, Payment: 13, Direct Money: 11); the optional definition-capture test is skipped. 86 UI/formula/document checks PASS, including the existing Payment panel with explicit local-only Supabase fixture values. TH/EN synthetic loopback browser checks at 390/768/1024/1440 PASS. Targeted ESLint (zero warnings), `npx tsc --noEmit`, production build, artifact hash checks and tracked/new-file whitespace checks PASS. Browser/build checks use the approved local execution environment; they do not access Production data.

Independent-session PostgreSQL is not available locally (`psql`, `postgres`, `initdb`, `pg_ctl`, Docker/Postgres.app not found). PGlite duplicate submissions are serialized and **are not independent-session concurrency proof**. The database enforces safety through:

- Payment row `FOR UPDATE` plus ordered invoice locks in `money_allocation_lock`.
- Direct source advisory transaction lock (`direct_money:<uuid>`) plus source row `FOR UPDATE` in `vp_received_lock`.
- Active distribution `FOR UPDATE`, expected ID/version and exact source/choice checks.
- Unique `vp_distribution_current_payment`, `vp_distribution_current_direct`, Payment/Direct revision constraints, and unique `previous_id`.
- Unique `vp_distribution_audit_version` and deferred immutable evidence guards.
- Entitlement-source primary key on distribution, unique `(distribution_id,source_line_id,component_key)`, unique entitlement audit event, existing settlement locks and unpaid-contract guard.

All applied migrations and all 28 pre-existing untracked files were checked against the starting SHA-256 preservation manifest. No protected file changed. The shared test fixture's Invoice `case_id` is corrected from an obsolete UUID fixture type to the actual Production `bigint` type; no database schema is changed by that test correction.

## Exact intended file manifest

Paths below are relative to `/Users/paolawyer/vp-case-app/vp-case-web`; only these 25 files belong to the Phase 1 release.

1. `app/finance/FinanceSidebar.tsx`
2. `app/finance/finance-navigation.ts`
3. `app/finance/payments/vp-distribution-panel.tsx`
4. `app/finance/payments/vp-distribution.ts`
5. `app/finance/revenue-distribution/page.tsx`
6. `app/finance/revenue-distribution/[sourceType]/[id]/page.tsx`
7. `app/finance/revenue-distribution/workspace.tsx`
8. `app/finance/revenue-distribution/detail.tsx`
9. `app/finance/revenue-distribution/shared.ts`
10. `app/finance/revenue-distribution/workspace.module.css`
11. `lib/i18n/catalog.ts`
12. `lib/i18n/messages/revenue-distribution.ts`
13. `supabase/migrations/202607180067_add_revenue_distribution_workspace.sql`
14. `scripts/tests/receipt-foundation.test.cjs`
15. `scripts/tests/revenue-distribution-postgres.test.cjs`
16. `scripts/tests/revenue-distribution-ui.test.cjs`
17. `scripts/tests/revenue-distribution-browser.cjs`
18. `scripts/tests/revenue-distribution-fixture.json`
19. `scripts/tests/revenue-distribution-contract.cjs`
20. `scripts/tests/revenue-distribution-contract.json`
21. `scripts/tests/revenue-distribution-artifacts.cjs`
22. `scripts/sql/preflight_revenue_distribution_067.sql`
23. `scripts/sql/dry_run_revenue_distribution_067.sql`
24. `scripts/sql/verify_revenue_distribution_067.sql`
25. `docs/revenue-distribution-067.md`
