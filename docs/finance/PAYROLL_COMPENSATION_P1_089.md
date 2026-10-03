# Payroll & Compensation P1 — Migration 089 release

Status: **Migration 089 Human-applied and verified PASS; application release authorized.** Migration 089 is immutable. Production application UAT remains a separate Human step after deployment.
Repository: `/Users/paolawyer/vp-case-app/vp-case-web`, branch `main`.
The user-supplied P1 business rules govern this implementation; mockup numbers are not statutory rules.

## Ownership and money path

`user_profiles` remains login/internal identity. `finance_payees` and `finance_payee_destinations` remain payment identity. Login active status does not decide employment status.

Private effective-dated engagement/rate events → monthly draft → reviewed, frozen compensation line/net payable → existing `finance_payouts` (`source_model=payroll_v1`) → existing `finance_cash_transactions.source_payout_id` → existing account Statement/Cashbook.

A monthly period has at most one compensation line per payee. Each positive approved net payable creates its own Payout and cash outflow. Selected payments are an atomic user convenience, not consolidated money. Up to 50 explicit selected lines per batch. Zero-net lines are settled without inventing a zero cash movement. Preparing or approving moves no cash.

**Settlement boundary:** the generic Payout settles an already-net obligation. Its `gross_amount=net_amount=approved net payable` and `wht_amount=0`; this is not gross salary or a claim that payroll WHT is zero. Actual gross salary, deductions, payroll/service WHT and Social Security remain in the private frozen line and dedicated obligations. This avoids withholding twice and avoids misusing fixed-rate outgoing WHT/distribution allocations. `finance_payroll_payments` is the typed source linkage; no fake expense, distribution entitlement, or duplicate cash ledger is created.

Employee net = base + additions − general deductions − employee SS − WHT. Employer SS is a separate company obligation and never reduces employee net again. Contractors have no employee/employer SS fields, enforced by SQL constraints. All statutory amounts are reviewed manual facts: there is no rate engine or hardcoded statutory rate.

## Schema and RPCs

Eight private tables:

- `finance_payroll_engagements`: append-only effective-dated employee/contractor and active/inactive engagement events; existing payee FK (employee requires internal identity).
- `finance_payroll_rates`: append-only monthly compensation rates, effective date and required reason.
- `finance_payroll_periods`: unique month, target payment date, draft/approved status, optimistic revision, approver/time. Partial/fully settled state derives from actual confirmed payouts.
- `finance_payroll_lines`: separate employee/contractor facts; generated gross/net; current-rate source evidence; review/adjustment reason; approved frozen evidence.
- `finance_payroll_obligations`: employee WHT, employee SS, employer SS, contractor WHT, uniquely per line/type; immutable source and amount.
- `finance_payroll_payments`: line↔existing Payout linkage, one live payment per line, immutable prepare/confirm evidence. Cancelling a draft retains history and permits a fresh draft.
- `finance_payroll_requests`: actor-bound exact-request retry results.
- `finance_payroll_audit`: append-only command evidence with request/actor/time.

Authenticated entry points (all recheck active Admin):

- `payroll089_read(uuid)` — private workspace, history, periods, lines, obligations, existing payee/account options.
- `payroll089_manage(text,jsonb,uuid)` — engagement, rate, create/edit/reload draft, review line, approve.
- `payroll089_payment_batch(text,jsonb,uuid,boolean)` — prepare, confirm, cancel drafts.

Internal helpers are not executable by application roles. Deferred integrity triggers validate approved line snapshots, exact statutory obligations, one live linkage, payout/cash/audit consistency and no legacy WHT/allocation misuse. Approved lines/periods, rates/engagement events, obligations and audit cannot be edited/deleted/truncated. Direct table privileges are revoked from anon/authenticated/service_role; RLS also requires active Admin.

Existing schema changes are limited to the `finance_payouts.source_model` allowlist and an Admin-only payroll payment guard trigger. `payout_assert` receives a payroll-only dispatch before its unchanged expense/distribution paths. Account Statement receives a payroll-safe description/recipient/navigation projection; balance calculation, coverage, ordering, dates and cash source are unchanged. No columns are added to existing business tables. Migration 088 and migrations 001–087 are untouched.

## Dates and review boundaries

History uses unique `(payee_id,effective_from)` events. End dates derive from the next event, producing non-overlapping half-open intervals without overwriting a previous rate. Events cannot be backdated across any approved period for that person.

For a partial employment month or mid-month rate change, P1 requires an explicitly reviewed monthly base and adjustment reason. It does not prorate automatically. Changed sources invalidate draft approval; “Reload people / rates” explicitly clears draft reviews and reloads the current sources before review.

**Human policy review:** a month containing multiple active engagement segments for one person (especially employee↔contractor) fails closed with `PAYROLL_MIXED_ENGAGEMENT_MONTH`. P1 does not silently merge different treatments or create two payouts for one person. Month-boundary type changes are supported and tested. A mixed-month split policy must be separately agreed before enabling that case; no existing data is changed to evade the guard.

## Privacy

Only active Admin with no forced password change can use the server page, API or RPCs. Menu visibility is not the security boundary. The page uses the established scoped HttpOnly Admin access-session pattern; API responses are `no-store`, writes require same origin, and the caller's Supabase client is used (no service-role fallback).

Partner, Finance Operator, Account Custodian and employee have no salary-detail access. Existing account-authorized users can still see recipient, net cash amount, account and reference in Statement. Generic Payout choices/snapshots/audits contain only net execution facts and destination; no base, additions, deductions, SS or payroll tax facts. Non-Admin Statement links never navigate to private payroll. Cash audit permissions retain the existing 078 Admin restriction.

## Obligations, accounting and deferred work

Obligations remain **pending** in P1. Neither approval nor salary payment marks them remitted or creates remittance cash. Later integration must connect actual remittance cash and an approved statutory filing model before a remitted status is enabled. No manual “paid” flag is provided.

Annual accounting totals can be derived from approved frozen lines grouped by year and engagement kind; net actually paid must join confirmed Payout/Cash facts, including payment date. Rates or a new manually entered annual total are not an annual source of truth. Employee and contractor reporting stays separate.

Deferred: filing/remittance workflows, annual export/report UI, employee payslips/self-view, attendance/leave/OT, recurring generation, automatic tax/rate/proration engines, mixed-engagement month split policy and post-payment corrections. No new journal or Cashbook.

## Gate contract and provenance

Preflight is static SELECT-only. Dependencies begin with the independently reconciled, accepted 088 table/function pins (which incorporate accepted 070/071 and exact 078 additions/security), plus accepted 071/078 full-object pins for payout immutability, payee reading, legacy payout assertion, cash lifecycle, tax immutability and treasury reading. Fixture ACLs are adapted to these independently accepted hashes; fixture permissions are not treated as Production authority.

It checks exact dependencies and an empty payroll namespace. It also returns deterministic historical Finance/user/audit row fingerprints and a broad unrelated catalog/security/function preservation fingerprint. Text aggregation/order uses `COLLATE "C"`. NOT NULL is verified through `pg_attribute.attnotnull`, excluding PG18-only `pg_constraint` NOT NULL entries. PostgreSQL 18 is available locally; a PG17 executable is not available here.

The migration owns one transaction, requires postgres, takes bounded schema/dependency locks, rejects a changed accepted contract, installs no seed/backfill, and compares before/after historical rows and unrelated objects. Changed/new objects must match exact candidate hashes. Existing payout, cash and 088 contracts remain pinned except the explicitly listed integration changes.

The post-apply verifier is bound to the exact Human-reviewed 089 Production Preflight baseline: `rows_sha256=d7439a1db0fbcb7abadfeaed977c250f21fea50fa4eba16da0ce87623dc1af6a` and `preserved_sha256=9136fbd2a8e169d95dcdb8d947a861f637155922f01ec6d22b8418e12b1f5b5f`. It rejects an unreviewed baseline, unexpected historical mutation/deletion, schema/RPC/security drift or payroll seed. It never calls business RPCs. The Human-reported post-apply result is `gate_pass=true`, empty failed checks and table/function differences, `business_rpc_executed=false`, and `broader_finance_differences_accepted=false`. Do not rerun the migration or replace the reviewed baseline with later business activity.

## Local validation

Commands:

```sh
node scripts/tests/finance-payroll-artifacts.cjs
node scripts/tests/finance-payroll-local-postgres.cjs
node --test scripts/tests/finance-payroll.test.cjs
node scripts/tests/finance-payroll-browser.cjs
npx tsc --noEmit
npm run build
```

PostgreSQL uses a disposable private Unix-socket cluster; no environment credentials or network endpoint is loaded. Tests cover effective history, future type transition, manual mid-month review, freeze/immutability, source reload, formulas, separate employer SS, contractor exclusion, zero net, four obligation types, no cash on approval, selection/prepare/confirm, atomic rollback, exact retry, concurrent duplicate requests, single/different accounts, draft cancellation/reprepare, Statement reconciliation, non-Admin/inactive denial, generic projection privacy, preservation/verifier drift and existing expense/WHT/distribution behavior.

Browser checks use actual React/CSS and a synthetic closed adapter at 1440/390px, TH/EN: separated tracks, manual review, history, one/non-first/all selection, separate cash records, duplicate click guard, read-back recovery, no overflow or console/runtime errors. No real financial transactions are created.

## Completed Human migration gate — retained commands, do not reapply

1. Human reviewed SELECT-only Preflight PASS and the exact baseline hashes above.
2. Those hashes were bound to `scripts/tests/fixtures/finance-payroll-reviewed-baseline.json` and the verifier; the candidate remained byte-identical.
3. Human applied the immutable candidate once and confirmed bound post-apply verification PASS.
4. Human authorized this application release. The commands below are historical gate references, not instructions to execute again.

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_finance_payroll_089.sql
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/supabase/migrations/202610030089_finance_payroll_compensation_foundation.sql
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/verify_finance_payroll_089.sql
```

## Final application release validation

Payroll PostgreSQL tests passed all 15 scoped scenarios, including preservation/verifier drift, private facts, atomicity, concurrent retry and existing individual expense/WHT/distribution payout execution after 089. The separate 088 PostgreSQL regression suite also passed. The Payroll and bulk-payment application/static/security tests passed 12/12. TH/EN browser checks passed at 1440px and 390px with no horizontal overflow or console/runtime errors. Touched-file ESLint, TypeScript, production build and whitespace checks passed.

The release stages only the 23 intended files listed below. Migrations 001–088 and the applied 089 bytes remain unchanged; unrelated tracked/untracked work is preserved. Release uses the established push-to-main Vercel Git integration, with commit/READY correspondence recorded in the release response. No Production SQL, business RPC, test payroll record or financial data mutation is part of the agent's release work.

Human Production UAT:

1. Check `เงินเดือนและค่าตอบแทน / Payroll & Compensation` in TH/EN and on mobile; confirm the three tabs: periods, people and statutory obligations.
2. Confirm only active Admin can see/use payroll details, including direct navigation; Partner, Operator, Custodian and employee must remain denied.
3. With Human-approved records, review separate Employee/Contractor tracks, effective-dated compensation history and a future rate change; historical approved periods must remain unchanged.
4. Review and approve a period; facts freeze and statutory obligations remain pending, with no cash movement caused by approval.
5. During Human-controlled payment UAT only, prepare selected people, then confirm only actual payments. Each positive net line must have its own Payout and Statement/Cashbook outflow; employer Social Security must not reduce net pay again.

## Candidate and file inventory

Candidate SHA-256: `d08607902bb1e04ade69c320d7538336168f83fe627aad19985234a9fb71d53b`.

23 intended files (2 existing navigation files edited, 21 new P1 files):

- `app/finance/FinanceSidebar.tsx`
- `app/finance/finance-navigation.ts`
- `lib/server/finance-payroll.ts`
- `app/api/finance/payroll/route.ts`
- `app/finance/payroll/client.ts`
- `app/finance/payroll/labels.ts`
- `app/finance/payroll/model.ts`
- `app/finance/payroll/page.tsx`
- `app/finance/payroll/payroll.module.css`
- `app/finance/payroll/workspace.tsx`
- `app/finance/payroll/access/page.tsx`
- `supabase/migrations/202610030089_finance_payroll_compensation_foundation.sql`
- `scripts/sql/preflight_finance_payroll_089.sql`
- `scripts/sql/verify_finance_payroll_089.sql`
- `scripts/tests/finance-payroll-body.sql`
- `scripts/tests/finance-payroll-artifacts.cjs`
- `scripts/tests/finance-payroll-local-postgres.cjs`
- `scripts/tests/finance-payroll-postgres.test.cjs`
- `scripts/tests/finance-payroll.test.cjs`
- `scripts/tests/finance-payroll-browser.cjs`
- `scripts/tests/fixtures/finance-payroll-contract.json`
- `scripts/tests/fixtures/finance-payroll-reviewed-baseline.json`
- `docs/finance/PAYROLL_COMPENSATION_P1_089.md`
