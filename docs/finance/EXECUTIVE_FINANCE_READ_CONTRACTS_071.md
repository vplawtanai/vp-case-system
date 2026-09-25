# Phase 5A — Executive Finance read contracts (applied 071)

Baseline: `main`, `9c1663f3321df6293b7b3f8353568a0420f51c2e`.
Production gate completed by the operator on 25 September 2026: Preflight, rollback-only Dry-run and Post-Apply Verifier PASS; manual Apply SUCCESS. No Production SQL is executed during release.
Migrations 001–071 remain immutable. The original candidate audit/gate history below is retained; the Phase 5 release is documented in [EXECUTIVE_FINANCE_DASHBOARD_PHASE5.md](./EXECUTIVE_FINANCE_DASHBOARD_PHASE5.md).

## Source audit

| Domain | Authoritative source | Authorization retained | Drill-down for later UI |
|---|---|---|---|
| Cash flow | Confirmed `finance_cash_transactions`; 070 `finance_treasury_transfer_legs` identifies controlled transfers | `current_user_can_view_finance_cash_transactions()` and `treasury_can_view(bank,cash)` on each visible row | `/finance/statement` |
| Receivables | 029 `finance_invoice_settlement_summary`, which uses effective allocations and confirmed Payments | Invoice guard `current_user_can_manage_finance_quotations()`; SECURITY INVOKER retains Invoice/Payment/allocation RLS through both existing invoker views | `/finance/invoices` |
| General Payables | 055/060 `finance_expense_obligations`, accepted expenses, obligation waivers and payout allocations | `expense_can_view_all()` exactly as the existing queue RPC | `/finance/payables` |
| Participants | 048 frozen individual entitlements/sources, effective finalized Distribution and confirmed Payment/Direct Money, 051/068 settlement allocation | `current_user_can_view_finance_payments()` exactly as the Distribution/entitlement workspace | `/finance/revenue-distribution` |

The current queue exposes 50 historical obligation rows per page, without an open-only aggregate. The Distribution workspace summary is the distribution basis, not individual liability. The Invoice settlement view is per invoice. Account Statement totals include transfers even when its row filter selects transfers. These new aggregates close only those read gaps.

## Public contracts

All functions return JSONB with `schema_version: 1`, `semantics`, `as_of` (statement timestamp), `timezone: "Asia/Bangkok"` and `currencies: [...]`. There is no cross-currency grand total. An authorized empty set is `currencies: []`; denial raises the existing domain permission error and is not a zero balance.

### `get_finance_cash_flow_summary(p_from date, p_to date)`

`semantics: "period"`, `from_date`, `to_date`, `scope: "visible_accounts"`.
Inclusive Bangkok calendar days: start midnight through the exclusive midnight after `p_to`. Null, infinite and reversed ranges are rejected.

Each currency row:

```text
currency
external_inflow_count, external_inflow
external_outflow_count, external_outflow
internal_transfer_count, internal_transfer_amount
```

Only confirmed Cashbook rows contribute. No opening-balance table is joined. Customer WHT credit never becomes cash. Recipient net cash and later tax remittance each contribute only their own actual Cashbook movement. Cash reversals remain actual opposite-direction movements, matching Statement.

The existing 070 unique bridge and deferred integrity triggers enforce two equal immutable transfer legs. Aggregate visible legs by `(currency, transfer_id)` and count the amount once. A caller with access to only the incoming or outgoing account sees the transfer amount already visible in that account; its hidden counterpart/account/transactions are not returned or queried for an additional amount. Transfers never enter external totals. Inactive accounts with visible history are retained.

This RPC does not provide current liquidity or reinterpret missing opening balances; the existing Treasury balance contract remains authoritative for that separate metric.

### `get_finance_receivables_summary()`

`semantics: "current"`, `as_of_date`, `due_soon_from`, `due_soon_through`.
The due-soon interval is explicitly inclusive of Bangkok today through today + 30 days. It is a date classification, not a cash forecast.

Each currency row:

```text
currency
outstanding_count, outstanding_amount
overdue_count, overdue_amount
due_soon_count, due_soon_amount
no_due_date_count, no_due_date_amount
```

Only `invoice_status = issued` and positive existing outstanding amounts contribute. No new settlement formula: confirmed cash plus WHT settlement credit comes from the existing view. Draft, cancelled, voided and fully settled invoices are excluded. NULL due date is never overdue. Existing `is_overdue` remains authoritative.

### `get_finance_general_payables_summary()`

Same current/date metadata and due-soon window as Receivables.

Each currency row:

```text
currency
outstanding_count, outstanding_amount
company_purchase_count, company_purchase_amount
reimbursement_count, reimbursement_amount
overdue_count, overdue_amount
due_soon_count, due_soon_amount
no_due_date_count, no_due_date_amount
```

Source types are the existing `supplier_payable` and `employee_reimbursement`; never inferred from description/category. The expense must remain accepted. A waiver or settlement allocation excludes the obligation exactly as in the queue. This reads only expense obligations, never distribution entitlements. Gross approved obligation is the liability; net recipient cash after WHT is not its remaining balance. Existing schema restricts these obligations to THB, but the response still groups by currency without relaxing that constraint.

### `get_finance_unpaid_participants_summary()`

`semantics: "current"`, `partial_entitlement_settlement_supported: false`.

Each currency row:

```text
currency
unpaid_entitlement_count, unpaid_participant_count
unpaid_amount, oldest_unpaid_at
```

Only open frozen user entitlements in referral/work buckets, on an open source and matching finalized distribution revision, backed by confirmed Payment/Direct Money, remain eligible. Superseded/inactive evidence is excluded. The existing schema cannot hold a Company Share entitlement; the aggregate also explicitly restricts recipient/bucket.

The existing lifecycle settles an entire entitlement with one unique allocation. Individual partial settlement is not supported and is not invented in 071. A partially paid distribution retains the full gross amounts of its other unpaid entitlements. Once allocated, outgoing WHT awaiting tax remittance does not leave a false participant balance. The existing exactly-once payout constraints/RPCs are untouched.

## Security and scope

- Four new `STABLE` functions; pinned `search_path=public`; owner `postgres`.
- Receivables uses SECURITY INVOKER. Other three use the established domain SECURITY DEFINER pattern with explicit existing guards; Cash also checks account visibility.
- Explicit REVOKE from PUBLIC, anon, authenticated and service_role, then GRANT EXECUTE only to authenticated/service_role. Domain guards still require an authorized identity. No default privilege dependence.
- No permission, policy, RLS, table, index, trigger, existing function or view changes.
- No new economic/tax facts, Payable, Reimbursement, Payout, Cashbook, Legacy or distribution writes.
- No amount combines cash, economics, tax, receivables, payables or participants.

## Gate provenance and workflow

`executive-finance-artifacts.cjs` takes the accepted reconciled **post-070** manifest first. Existing accepted fingerprints are copied unchanged; synthetic database ACLs never replace them. That footprint also protects existing Phase 1–4 write/read contracts, Tax and Legacy history.

Two additional dependencies are reconciled explicitly:

1. `current_user_can_manage_finance_quotations()` — captured definition/owner/security/search_path matches the exact original 202607090001 repository definition compiled locally. The inherited receipt fixture's simplified admin-only stub is not authoritative.
2. `finance_invoice_settlement_summary` — existing captured catalog matches columns/owner/structure from the unchanged 029 view; the definition/security-invoker option is compiled from that exact migration. Existing captured ACL is preserved, never granted more broadly.

Their current-state security evidence is the hash-verified corrected PASS 066 capture. Preflight checks that Production still matches it exactly. Candidate 071 has no means to change either dependency's ACL. This does not accept unrelated broader differences. The broader **490 unresolved differences remain documented outside this scope**, with no wholesale snapshot adoption or synthetic defaults.

Preflight is **one static SELECT statement**. It verifies candidate bytes, expected contract hash, exact dependencies/security, absence of all four target function names (including unexpected overloads), invoker view and unique full-entitlement settlement constraint. It captures fresh compact `state_sha256` and `historical_rows_sha256` covering the preserved historical business-row scope plus 070 economic decisions/transfers/legs. It does not claim rows unchanged before an approved baseline exists.

Only Preflight is prepared in Phase 5A. After operator approval, the returned hashes can pin the later self-contained rollback-only and post-apply gates. No JSON/CSV transfer, converter, psql or SSL configuration is required. Later gates and Manual Apply are not prepared now.

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_executive_finance_071.sql
```

Paste into Supabase Production SQL Editor, New Query, Run, then return the result. **STOP at manual Production Preflight.** The agent has not executed Production SQL.

## Local validation

- `executive-finance-postgres.test.cjs`: isolated PostgreSQL/PGlite, synthetic records, real existing controlled payment/payout/transfer/waiver lifecycles. Additional adversarial rows are explicitly test-only.
- Covers four aggregates, authorized/unauthorized/anon/null identity, account restriction, invoker RLS, transfer/WHT/opening anti-inflation, optional due dates, confirmed/partial/full invoice settlement, paid/waived/inactive obligations, partially paid and superseded distributions, currency separation, exact additive catalog/function change and complete fixture row preservation.
- `executive-finance-artifacts.test.cjs`: exact migration/predecessor hashes, baseline precedence, four STABLE read-only functions, one SELECT-only static Preflight, no broader baseline acceptance.
- Local Preflight execution verifies PASS and rejection of ACL/function expectation/target overload mismatch; historical-row edits change both captured hashes.
- `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` executes all four aggregate query bodies. Local plans use existing cash/transfer/allocation/entitlement indexes and DB aggregates. Evidence is `/private/tmp/071-query-plans.json`. This is synthetic plan evidence, not a Production load benchmark. **No new index is justified or added.**
- Existing 066–070 DB regression tests are included through the shared harness; no write concurrency claim is made for these read-only functions.
- Targeted ESLint and `git diff --check`. TypeScript/build/UI smoke are not applicable: no application/type/UI files changed.

Validation result: **16 new targeted tests PASS; 57 existing 066–070 regression tests PASS**, with four optional fixture-capture tests skipped. Targeted ESLint, exact artifact validation and whitespace checks pass. All 586 previously protected files match their recorded SHA-256 values, including pre-existing unrelated files.

The legacy operator-gate tests for 049/069/070 deliberately COMMIT disposable fixture state. A monolithic inherited-suite run therefore hit `schema "storage" already exists` in subsequent tests. No old harness was changed: regressions were rerun per migration, and the 069/070 literal rollback tests each passed in a fresh process. Do not use one shared fixture for every historical gate.

Reproduce the new tests with the already available local runtime (no dependency installation):

```sh
PGLITE_MODULE_PATH=/private/tmp/vp-066-acl-test-deps/node_modules/@electric-sql/pglite node --test --test-name-pattern='^071' scripts/tests/executive-finance-postgres.test.cjs scripts/tests/executive-finance-artifacts.test.cjs
node scripts/tests/executive-finance-artifacts.cjs --validate
```

Candidate SHA-256: `2eea6e2ae7f2f3d127680a3912dd286b0cdb8073d09e997f15c138f2bbec342c`.
Static Preflight: **75,197 bytes / 156 lines**. No Dry-run, Apply or Verifier for 071 has been prepared.

## Intended files

1. `supabase/migrations/202607180071_add_executive_finance_read_contracts.sql`
2. `scripts/tests/executive-finance-postgres.test.cjs`
3. `scripts/tests/executive-finance-artifacts.cjs`
4. `scripts/tests/executive-finance-artifacts.test.cjs`
5. `scripts/tests/executive-finance-contract.json`
6. `scripts/sql/preflight_executive_finance_071.sql`
7. `docs/finance/EXECUTIVE_FINANCE_READ_CONTRACTS_071.md`
