# Payroll 093 — atomic correction of unfinalized setup

Status: Migration 093 Human-applied and post-apply verified PASS; application release authorized. Migrations 089–093 are immutable. Release validation uses disposable local data only; no Production SQL or business RPC is run by the release agent. Human Production UAT follows deployment.

Candidate: `supabase/migrations/202610040093_finance_payroll_setup_correction.sql`

SHA-256: `cc083ad3e973646b3903b628ac50cce132faa88d582488eb4e7707ed18e9eb58`

## Contract

`payroll093_correct(p_kind text, p_payee uuid, p_target uuid, p_expected_hash text, p_values jsonb, p_request_id uuid)`

- `p_kind`: `engagement` or `rate`. `p_target` is the existing record ID, never a replacement ID.
- `p_expected_hash`: the existing `payroll092_read().corrections[payee_id].hash`.
- Engagement values: `kind`, `effective_from`, `reason`. Active/inactive status and creation identity are preserved.
- Rate values: `monthly_amount`, `effective_from`, `reason`.
- Active Admin only; internal payee identity; fixed `search_path`; private dependency/timeline helpers. No new table, column, RLS policy, trigger or application DML grant.
- Same-date correction updates that row in place. Moving its effective date is also a correction when the Admin explicitly selects correction intent.
- A genuine future change still appends via `payroll089_manage`; its existing business behavior is preserved except early date-collision and mixed-treatment rejection.

## Atomic safety

The RPC takes `payout_lifecycle` then `payroll089` transaction locks, then deterministic payee/period/line/engagement/rate row locks. It compares the complete person state hash, validates the proposed date and timeline, and checks dependencies across both old and proposed effective intervals. Explicit source/frozen snapshot references are checked independently of dates, including secondary rate intervals.

Frozen/approved lines, any payroll payment or payout reference (including cancelled payments), obligations, cash/snapshot references block correction. The existing `payroll092_line_safe` protection remains authoritative for line dependencies. Creation metadata, record ID, other people and finalized history are never rewritten.

An immutable request holds exact before/after rows, invalidated unfinished lines, actor and transaction ID. A narrow addition to `payroll089_protect` permits only those exact operations in that transaction. The full 092 protection remains below it. No general UPDATE permission is introduced.

Only affected unfinished monthly lines are removed as invalidated reviews, with full evidence retained in the request/audit. The next read resolves the corrected setup; amounts, tax and SSO require explicit review again. The engagement/rate itself is **updated**, never deleted/recreated. No cash, payout or statutory obligation is generated. Any failure, including audit failure, rolls back everything. Exact retries return the existing result; changed retry payloads fail closed.

## Month boundary

`payroll093_engagement_check` simulates the proposed effective timeline before INSERT or correction. Active Employee and Contractor intervals may not overlap the same calendar month. A continuous real type change therefore starts on the first of a month. This applies even to direct calls to the existing manage RPC. An initial relationship start and a relationship end can still occur mid-month and retain 090 manual amount review behavior. No split-treatment engine is added.

## Application

The existing rate/engagement popup opens on the record displayed for the selected month, with its real effective date. A compact business intent choice distinguishes “Correct an entry mistake” from “Change from a new effective date”; it avoids guessing intent when the date changes. Correction uses the new RPC and displayed state hash. Future change uses the existing append contract. Save closes and reloads the table through the existing flow.

Known finalized, collision, month-boundary, stale and invalid-input errors have TH/EN messages. Monthly amounts, additions/deductions, SSO/WHT, bank setup, reset/delete and payment UI are otherwise unchanged.

## Files

- `app/finance/payroll/setup.ts`
- `app/finance/payroll/workspace.tsx`
- `app/finance/payroll/labels.ts`
- `lib/server/finance-payroll.ts`
- `supabase/migrations/202610040093_finance_payroll_setup_correction.sql`
- `scripts/sql/preflight_finance_payroll_setup_093.sql`
- `scripts/sql/verify_finance_payroll_setup_093.sql`
- `scripts/tests/finance-payroll-setup-body.sql`
- `scripts/tests/finance-payroll-setup-artifacts.cjs`
- `scripts/tests/finance-payroll-setup-local-postgres.cjs`
- `scripts/tests/finance-payroll-setup-postgres.test.cjs`
- `scripts/tests/finance-payroll-setup-support.cjs`
- `scripts/tests/finance-payroll-setup.test.cjs`
- `scripts/tests/finance-payroll-setup-browser.cjs`
- `scripts/tests/finance-payroll-correction-browser.cjs` (existing future-rate test selects future intent explicitly)
- `scripts/tests/fixtures/finance-payroll-setup-contract.json`
- `scripts/tests/fixtures/finance-payroll-setup-reviewed-baseline.json`
- `docs/finance/PAYROLL_SETUP_CORRECTION_093.md`

## Validation

Run from the repository root:

```sh
node scripts/tests/finance-payroll-setup-artifacts.cjs
node --test scripts/tests/finance-payroll-setup.test.cjs scripts/tests/finance-payroll-correction.test.cjs scripts/tests/finance-payroll-monthly.test.cjs
node scripts/tests/finance-payroll-setup-local-postgres.cjs --browser
npx tsc --noEmit
npm run build
git diff --check
```

The PostgreSQL runner is a private Unix-socket disposable PG18 cluster; it does not load environment files or connect to Supabase. It runs the required 089–092 predecessor regressions plus 093 A–L tests. Browser checks execute the real React popup through the actual application handler and real SQL RPC, then reread updated facts (TH desktop, EN 390px). They do not treat a simulated successful response as mutation evidence. Auth/directory scaffolding is local; Admin checks are additionally tested in SQL and existing API tests.

Tests cover same-date amount/type correction in both directions, safe effective-date correction, frozen/paid and secondary snapshot dependencies, future append, mid-month rejection before writes, mid-month start/end, collision, state/retry guards, direct-update denial, audit rollback, no cash on correction, unchanged 091 separate cash outflow and 092 reset/deletion boundaries. Gates reject row/object/security drift and an unbound post-apply baseline.

## Human gate

The preflight is SELECT-only. It checks the accepted 092 contract inherited from reviewed predecessors, including owners/security/grants and portable NOT NULL catalog normalization. Expected prior contracts are not relearned from synthetic fixtures. Local capture pins only the five intentionally new/changed function definitions.

The post-apply verifier is bound to the exact Human-reviewed Production baseline below. It retains fail-closed row and unrelated-contract equality checks; disposable fixture hashes are never substituted.

- `rows_sha256`: `a4c938db4aa5a9ac4becca6ccbbcc08ac9bf784adfe92b9ba3949a1a9a72e77b`
- `preserved_sha256`: `cc6cbfc633c328e893c1325f7e886b7154e45c88cdd4cd3613f61b281d34e64e`

Human reports `gate_pass=true`, `failed_checks=[]` after applying this exact candidate. The commands below are retained as gate documentation, not release actions.

Preflight:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_finance_payroll_setup_093.sql
```

Human Apply, only after preflight review and baseline binding:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/supabase/migrations/202610040093_finance_payroll_setup_correction.sql
```

Post-Apply Verifier:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/verify_finance_payroll_setup_093.sql
```

Immutable predecessor SHA-256 values:

- 089: `d08607902bb1e04ade69c320d7538336168f83fe627aad19985234a9fb71d53b`
- 090: `ac132aca894486c8652f47ad01a7a864a3cd765fd79273d4ab331595eaece74b`
- 091: `f375b985260d1c132efec25f8f51b4432b6cb5d580ae93d7bc3397d1b29d882b`
- 092: `4a2288524b8eb7970f44be044d299b354e60f24674a9afe24eec4c5cf42bcb60`

## Application release validation

The targeted 091–093 static/API suites pass (19 tests), as do the five disposable PostgreSQL 089–093 suites and the actual browser/API/SQL mutation checks. The existing 092 browser regression also covers monthly amounts, known tax/SS edits, reset/delete, bank setup, distinct per-person payments and double-click protection. TH desktop (1440px) and EN mobile (390px) have no overflow or console/runtime errors.

Three assertions in the older `finance-payroll.test.cjs` suite predate the 091/092 application contract: retired period-action routing and its old GET fixture. They also fail with the unchanged HEAD server implementation. Current routing, privacy and historical-read behavior are covered by the passing 091/092 suites; this release does not restore retired API actions or alter that old suite.

Release follows the established push-to-main Vercel Git integration and verifies READY against the released Git SHA. Only the 18 files listed above are staged; unrelated work remains untouched.

Human UAT:

1. In an unfinalized recurring-rate popup, choose correction, keep the effective date, change 15,000 to 16,000 and save. Reopen to confirm the amount persisted.
2. Choose a future change of 18,000 from 1 November; check October is unchanged and November uses the new rate.
3. Correct an erroneous unfinalized Employee/Contractor entry. For a genuine future type change, verify the first of a month succeeds and a mid-month change shows the localized explanation.
4. Confirm finalized/paid history cannot be corrected, and check the same popup in TH/EN and on mobile.
