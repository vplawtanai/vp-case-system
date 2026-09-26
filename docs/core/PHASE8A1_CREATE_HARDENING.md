# Phase 8A.1 — Create hardening candidate status

Baseline: `main`, HEAD = local origin/main = `1b4c1f73ae3bcde6e5a4de497d4a97b8f8ccfef3`.
Latest existing migration is `202607180071_add_executive_finance_read_contracts.sql`.
Next number is 072; no competing 072 exists. Candidate:
`supabase/migrations/202607180072_core_numbering_create_hardening.sql`.

**Production migration gate PASS; application release authorized.**
The operator manually applied Migration 072 and supplied its successful verifier.
Release validation is complete; deployment and non-mutating smoke evidence will
be recorded below after the application release. Do not reapply the migration.

## Frozen authorization

| Caller with active profile | Create Case | Create Advisory Matter |
|---|---|---|
| Admin / Partner / Lawyer | Yes | Yes |
| Assistant Lawyer | No | Yes |
| Staff / Viewer / anonymous / inactive | No | No |

Lawyer+ remains role `lawyer` with separately configured Finance capabilities. Authorization must use `auth.uid()` and profile ID, never similar display names. Case identity editing, Staff task/time-log permissions and all existing child workflows remain separate from top-level CREATE.

## Existing flow and completed local application change

Case: `/cases` → Add Case → Create → confirmation. Existing caller checked `canCreateCase`, called `generate_file_no`, then separately inserted a Case with optional Client, empty initial identity fields, Active/litigation/Cabinet defaults and timestamps. The client display name came from the selected client. Successful creation displayed the assigned file number and navigated to detail.

Local candidate calls `create_case_with_number(p_client_id uuid default null)` once and receives a JSON object containing `id` and `file_no`. The RPC derives the client name from the existing client record and preserves the exact Case defaults above. The UI/confirmation/navigation is unchanged.

Advisory: `/advisory` already displays its create form for Admin/Partner/Lawyer/Assistant Lawyer. Client, title, custom type and numeric retainer validation occur before creation. The original create branch called its generator and then separately inserted. Edit is a separate direct UPDATE branch.

Local create candidate calls `create_advisory_matter_with_number` with exactly the current payload fields:

`p_client_id`, `p_title`, `p_matter_type`, `p_retainer_type`, `p_status`, `p_responsible_lawyer`, `p_start_date`, `p_end_date`, `p_monthly_retainer_amount`, `p_scope_of_work`, `p_note`.

It receives the committed record as JSON and retains the existing subsequent audit call. Edit and the existing decision to include/omit financial fields are unchanged. There is no new actor parameter, new form field, confirmation or navigation step. The RPC parameter types are `(uuid,text,text,text,text,text,date,date,numeric,text,text)` in the order above.

## Authoritative evidence and scope

The user's continuation supplies the verified Production SELECT captured at **2026-09-26T14:43:37.87954+00:00**: both exact generator bodies, counter columns/PKs, current broad grants/RLS, `can_write_case_data()`, Case INSERT/UPDATE policies, and Advisory's active-profile role predicate. This supersedes the previous missing-evidence status; no further SELECT or raw-result path was requested.

The existing year/number algorithms are copied unchanged, apart from an authorization guard before mutation:

- Case: update/increment an existing year row; insert the first row with unique-violation retry when absent; `VP-YYYY-NNN`.
- Advisory: `INSERT ... ON CONFLICT(year) DO UPDATE ... RETURNING`; `ADV-YYYY-NNN`.
- Annual counter PKs serialize competing allocations; a counter row lock remains held through the corresponding business INSERT and commit.
- No update to historical numbers or counters, no backfill, and no new numbering format.

The record INSERT fields derive from the current app create handlers, not a guessed new business model. Original defaults, optional Case Client, required Advisory Client/title/type, and Advisory payload semantics remain intact.

## Explicit security contract

- Add `can_create_case()` and `can_create_advisory_matter()`: active profile, `auth.uid()`, exact roles in the matrix; no Finance flags or display-name authorization.
- Alter only `cases_insert_policy` to `WITH CHECK (public.can_create_case())`. Fail before alteration if its verified command/role/predicate changed, an additional permissive INSERT/ALL policy exists, or the expected Case UPDATE policy is missing.
- Preserve `can_write_case_data()` and Case UPDATE exactly. Preserve **every Advisory policy unchanged**, including existing INSERT eligibility; no optional policy refactor is needed.
- Both atomic create RPCs explicitly authenticate/authorize before any allocation or INSERT. They use SECURITY DEFINER with `search_path=public`, fully qualified business tables/functions and owner `postgres`, consistent with current controlled Finance/Core conventions.
- Helpers/create RPCs: revoke all from PUBLIC/anon/authenticated/service_role, then grant EXECUTE only to authenticated. No default-privilege reliance and no user-supplied actor.
- Raw generators: revoke EXECUTE from PUBLIC, anon, authenticated **and service_role**. They are owner-internal helpers, with additional active-profile authorization. Repository app/backend search found no necessary standalone allocator caller. The owner's create RPC can execute them without exposing a number-only API to clients.
- Counters: revoke ALL from PUBLIC, anon and authenticated (including SELECT and TRUNCATE). No client reads require SELECT. Preserve existing service_role administrative grants, owners, RLS state and counter values. The verifier checks effective table/column privileges too and fails closed if inherited grants still allow client access.
- No user/profile, Finance helper/permission, child policy, accounting, cash or Legacy changes.

## Transaction and embedded verification

Migration 072 is wrapped in BEGIN/COMMIT, with a 10-second lock timeout. It briefly locks the two counters and two business tables while comparing all counter rows and Case/Advisory row counts/content hashes before/after. The policy/helper and table owner/RLS snapshots are also compared. Temporary verification evidence is session-local, with no permanent audit/business table inserts.

The audit values 52/12 are references, **not fixed apply preconditions**. Legitimate later activity is accepted: local tests also apply at 77/31 and verify no reset/increment. Any failed or NULL verification check raises before COMMIT and rolls back all migration changes. The last statement is a SELECT returning the compact verification JSON; it invokes no creation/numbering RPC and consumes no number. It reports `gate_pass`, `failed_checks`, individual checks, before/after counters and historical-row evidence.

## Validation

- **18 tests PASS**: original 6 actual-handler tests plus 12 DB/static tests.
- Real PostgreSQL 18 in a newly initialized `/private/tmp/vp072-pg-*` cluster, private Unix socket, TCP disabled, no credentials or `.env` used by tests. Server stopped after testing.
- Admin/Partner/Lawyer Case creation allowed; Assistant Lawyer/Staff/Viewer/inactive/missing-profile/anonymous denied. Advisory additionally allows Assistant Lawyer; Staff/Viewer/inactive/anonymous denied. Lawyer+ keeps the same role semantics.
- Successful creation increments once; actual INSERT failures roll back existing-counter increments and first-counter-row creation. Raw function/table privilege denials are exercised as real database roles.
- **24 independent PostgreSQL transactions**, four batches of six: both generators with existing and absent annual counters. Distinct backend PIDs, unique contiguous allocated numbers and matching row counts.
- Case direct INSERT denial, unchanged UPDATE and child permissions, unchanged Advisory INSERT, profile/Finance canaries, and existing historical records checked. An inherited counter privilege deliberately causes fail-closed verification and complete DDL rollback.
- Generator algorithm comparison, app removal of standalone number calls and SELECT-only final statement checked statically.
- Targeted ESLint, `npx tsc --noEmit`, `npm run build` and `git diff --check`: PASS.

The fixture explicitly distinguishes user-verified counter/policy/function evidence from minimal synthetic business/child/Finance tables. These are local execution tests, not a claim to have tested every Production table/trigger or performed Human UAT. The existing Advisory audit call remains a separate post-create operation; this task makes numbering + record insertion atomic. It does not add request-level retry deduplication or change the existing three-digit `lpad` algorithm.

Reproduce local tests:

```sh
node --test scripts/tests/core-create-application.test.cjs scripts/tests/core-create-postgres.test.cjs
npx eslint app/cases/page.tsx app/advisory/page.tsx scripts/tests/core-create-application.test.cjs scripts/tests/core-create-postgres.test.cjs
npx tsc --noEmit
npm run build
git diff --check
```

Postgres.app binaries are used by default; a local PostgreSQL bin directory can be supplied as `VP072_PG_BIN`. macOS sandbox shared-memory restrictions require the local DB test process to run outside the sandbox. No Production connection is supported by the harness.

## Exact candidate files

1. `app/cases/page.tsx` — previously prepared single-RPC create branch.
2. `app/advisory/page.tsx` — previously prepared single-RPC create branch; edit unchanged.
3. `supabase/migrations/202607180072_core_numbering_create_hardening.sql` — new forward-only candidate.
4. `scripts/tests/core-create-application.test.cjs` — original six tests, unchanged during continuation.
5. `scripts/tests/core-create-postgres.test.cjs` — local PostgreSQL/security/atomicity/concurrency/static tests.
6. `scripts/tests/fixtures/core-create-verified-baseline.sql` — clearly labelled local test fixture.
7. `docs/core/PHASE8A1_CREATE_HARDENING.md` — this report.

Existing Phase 8A/8A.1 audit files and unrelated untracked files remain untouched. No previously applied migration was changed.

Candidate SHA-256: `4ba2558ae0e722847b5a4714b7f1ce7a257aec53a9037fe6e1f8480e9cd52b4f`.

Manual copy command (copies only; does not execute SQL):

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/supabase/migrations/202607180072_core_numbering_create_hardening.sql
```

## Production migration and release closeout — 2026-09-26

Operator-reported Production verification: `gate_pass=true`, `failed_checks=[]`.
All seven checks passed: counters unchanged, Case INSERT authorization, historical
rows unchanged, function security contract, counter client access removed, table
ownership/RLS preserved, and Case UPDATE/Advisory policies preserved.

- Case 2026 counter: **52 → 52**; **52 Case rows unchanged**.
- Advisory 2026 counter: **12 → 12**; **9 Advisory rows unchanged**.
- Applied Migration 072 SHA remains the value recorded above. It was neither
  modified nor rerun during release; no new Production SQL was executed.
- Final application signatures match the applied SQL: one `p_client_id` argument
  for Case and all eleven named Advisory arguments listed above. Neither create
  handler calls a raw generator. Active-profile AuthGuard and existing role/UI
  checks remain unchanged, with no additional click or confirmation.
- Release rerun: **18/18 tests PASS**, including **24 independent PostgreSQL
  transactions**; targeted ESLint, TypeScript, production build and diff check
  PASS. The sandbox's blocked Google Fonts download was resolved by rerunning
  the unchanged build with network access. Deployment evidence follows after release.

Atomic create Production mutation not artificially exercised; first real
business creation will be Human UAT.

Release commit/deployment/non-mutating smoke: pending release completion.
Do not start Phase 8B.
