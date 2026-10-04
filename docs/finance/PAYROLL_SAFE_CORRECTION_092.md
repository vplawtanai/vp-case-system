# Payroll 092: safe correction and single-page workspace

Migration 092 has been Human-applied and verified in Production. The candidate
is immutable. The single-page application release is authorized; Production
business RPCs and UAT-data cleanup are not part of the release.

## Scope and contract

No new tables or columns; no itemized additions/deductions model. The existing
numeric totals, note and reason remain authoritative. Migrations 089–091 remain
byte-for-byte unchanged. 088 Expense/Payables and 091 payment functions are pinned
unchanged by the candidate and gate.

Public Active-Admin-only RPCs:

- `payroll092_read(date,uuid)` returns existing Payroll/monthly facts plus correction
  eligibility and a SHA-256 state token per Payroll person in one statement snapshot. It does not create a person, month, line, payment or other row.
- `payroll092_correct(text,uuid,uuid,text,text,uuid)` accepts action `setup`, `rate`
  or `line`, person ID, target ID (null for setup), expected state hash, reason and
  request ID. The hash covers setup/rates/lines/period state and dependency safety.

Private helpers: `payroll092_line_safe`, `payroll092_rate_lines`,
`payroll092_state`. No application/service-role direct DML or helper execution.
Only `payroll089_protect()` changes among existing functions: a narrow DELETE
permit is added before its exact previous update/truncate protection. The permit
must match an immutable request, actor, current transaction and complete original
row. Setting a session variable alone cannot authorize deletion.

## Correction safety

All corrections take the existing payout_lifecycle → payroll089 advisory locks,
then deterministic row locks, verify the expected state, and use exact request
idempotency. Changed retries and stale previews fail closed. Full before/deleted
facts and reason are preserved in the existing immutable request/audit tables.
Any error rolls back the complete command, including audit/request insertion.

- Setup: removes only that person's Payroll engagements/rates and unfinished
  lines. Any finalized/referenced line or Payroll payout blocks setup deletion.
- Rate: checks primary rate IDs, secondary mid-month rate interval evidence, and
  effective source overlap. Only affected unfinished lines are cleared with it;
  the UI displays their count in the confirmation. Finalized or referenced
  affected lines block deletion. Unused future rates remain removable.
- Monthly line: controlled true delete. The next read previews recurring source
  again; no replacement row is written until explicit Save/Pay. Overrides,
  additions, deductions and review are discarded with the unfinished line.
- Frozen/approved/paid/zero-net-finalized lines, obligations, any Payroll payment
  link (including cancelled), and Payroll payout choice references are protected.
  Immutable cash outflows reference those protected payout identities.
- Shared user profiles, payees, destinations, Expense/Payables, periods and audit
  history are not deleted. No UAT or historical cleanup is included.

## Application prepared

One `/finance/payroll` workspace, month arrows, summary/obligations and compact
people table; no three-tab workflow. Inactive/effective history remains accessible
using a view filter. All edits and removal/payment confirmations use modals.
Recurring amount/effective date is separate from this month's amount. Additions
and deductions are single numeric totals, not item lists. Known tax/SSO can be
explicitly edited; unresolved facts stay blank until Admin provides them. A
Contractor never has SSO inputs or Employee SSO treatment.

Add Person uses the unchanged internal active + operational + assignable
predicate. The single modal calls existing payee/engagement/rate contracts with
stable child request IDs; this setup sequence is **not a new atomic DB RPC**.
An interrupted setup can be retried or safely removed with 092. Shared recipient
editing uses the existing Finance modal. Final payment remains one atomic 091
command; positive net amounts create separate payout/cash/Statement records.

## Gate provenance

The preflight starts from the exact accepted 091 after-contract (which retains the
reconciled 070/071/078/088/089/090 provenance), not a new synthetic Finance baseline.
Only new/changed 092 function pins are captured from disposable PostgreSQL.
Table fingerprints include attnotnull and exclude PG18's extra NOT NULL
pg_constraint representation, preserving the PG17/18 portable catalog convention.
The candidate verifies before/after function/table contracts, every public row
fingerprint and all unrelated preserved objects inside one transaction.

Both gates are SELECT-only and execute no business RPC. The post-apply verifier
is bound to the Human-reviewed Production baseline and remains fail-closed:

- `rows_sha256`: `f1c4febe6f8984fa0343032701ea386e57550685e516b3e327888b7a4923437b`
- `preserved_sha256`: `ed4deecb615414dca1c810959817702dadc4dc6335aafd3e360215a2cf67aca8`

Human reported `gate_pass=true`, no failed checks and no table/function
differences after apply. Local fixture row hashes must never replace these pins.

## Intended files

Application:
- app/finance/payroll/workspace.tsx
- app/finance/payroll/single-page.ts
- app/finance/payroll/monthly.ts
- app/finance/payroll/payroll.module.css
- lib/server/finance-payroll.ts

Candidate/gates:
- supabase/migrations/202610040092_finance_payroll_safe_correction.sql
- scripts/sql/preflight_finance_payroll_correction_092.sql
- scripts/sql/verify_finance_payroll_correction_092.sql

Artifacts/tests:
- scripts/tests/finance-payroll-correction-body.sql
- scripts/tests/finance-payroll-correction-artifacts.cjs
- scripts/tests/finance-payroll-correction-local-postgres.cjs
- scripts/tests/finance-payroll-correction-postgres.test.cjs
- scripts/tests/finance-payroll-correction.test.cjs
- scripts/tests/finance-payroll-correction-browser.cjs
- scripts/tests/fixtures/finance-payroll-correction-contract.json
- scripts/tests/fixtures/finance-payroll-correction-reviewed-baseline.json
- scripts/tests/finance-payroll-monthly.test.cjs (GET expectation adds read-only 092 metadata)
- docs/finance/PAYROLL_SAFE_CORRECTION_092.md

## Targeted validation

- Disposable PostgreSQL 18: 089/090/091 predecessor regressions and 092
  preservation/gate/deletion/recreation/stale/retry/privacy tests. Tests cover
  frozen/paid/zero-net, secondary rate evidence, dependency-only failures,
  retained shared identities, future rates, monthly overrides and atomic separate
  091 cash outflows. Production was not accessed. PG17 binary is unavailable.
- Static/model/server tests: accepted artifact equality, SELECT-only/unbound gate,
  privacy/CSRF, correction dispatch, internal setup eligibility/stable retry IDs,
  explicit tax/SSO edits, history visibility and 088 regression.
- Real UI with synthetic loopback-only adapter: TH desktop 1440px / EN 390px,
  one table/no inline editing, month reads, modal review/reset/recreate,
  known-tax editing, recurring 15,000 edit, bank popup, finalized deletion hidden,
  Contractor no SSO, explicit Employee SSO, individual and two-person payment
  with distinct payout/line IDs, double click, no horizontal overflow or runtime
  errors. Saving facts clears stale selection; batch selection follows review.
- Touched-file ESLint, TypeScript, production build, whitespace/diff checks.

Release validation on 2026-10-04: 20 targeted static/model/server tests passed,
four disposable PostgreSQL suites (089–092) passed, and both browser cases
passed. The PostgreSQL checks retain 088/individual payout contracts and confirm
separate immutable cash/Statement entries with atomic rollback. No Production
business RPC, migration execution or UAT-data cleanup was performed for release.

## Human commands (copy only; not executed by Codex)

Preflight:
```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_finance_payroll_correction_092.sql
```

Original Apply command, retained for provenance. Already applied; do not rerun
as part of the application release:
```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/supabase/migrations/202610040092_finance_payroll_safe_correction.sql
```

Post-apply verifier:
```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/verify_finance_payroll_correction_092.sql
```

## Candidate checksum

`4a2288524b8eb7970f44be044d299b354e60f24674a9afe24eec4c5cf42bcb60`
