# Advisory 081 — initialize the first Stage when creating a Matter

Status: **PRODUCTION HUMAN-APPLIED AND VERIFIED; REPOSITORY RELEASE APPROVED**.
Migration 081 is immutable applied history. Do not regenerate or reapply it.
The user reported `gate_pass=true`, `failed_checks=[]`,
`applied_state_exact=true`, `historical_rows_unchanged=true` and
`business_rpc_executed=false`. The reviewed row/catalog hashes below remain exact.
No Production SQL, backfill or business data mutation is performed by this release.
The gate-preparation sections below are historical evidence, not instructions to
repeat the completed Human Apply Gate.

## Project and scope

- Repository: `/Users/paolawyer/vp-case-app/vp-case-web`, branch `main`.
- Release base HEAD and origin/main: `00c3e31ba012cb1cac0eb8e858e707b5bb54c08e`.
- Only the definition of `advisory_control_write(uuid,text,jsonb,uuid,bigint)`
  changes. No new persistent table, column, policy, grant or function signature.
- Applied migrations 076–080, UI, Case and Finance remain unchanged. All 53
  pre-existing untracked files are preserved.

Applied migration: `supabase/migrations/202609300081_advisory_create_initial_stage.sql`.
SHA-256: `96428a6517218f94ca32cca806f4658e4d964bdae20f2ed91d925d226f3e9693`.

## Exact change

The accepted 077 RPC already creates the Matter, Lead, working state, Stage
plan, Activity and saved request response in one transaction. Its create path
does not open a Stage visit. 081 adds a create-only branch immediately after
that existing plan creation:

1. Read this new Matter's actual Stage rows, excluding terminal `stage_key='close'`.
2. Select the first row by numeric `position ASC`. The existing unique
   `(matter_id,position)` constraint makes this deterministic.
3. Raise `ADVISORY_INITIAL_STAGE_NOT_FOUND` when no operational Stage exists.
4. Insert one open `kind='visit'`, using the existing `moment` and actor.
5. Extend the single existing create Activity with `initial_stage` evidence:
   Stage ID/key/template, visit ID/kind and entered timestamp.

No Stage name such as intake/brief is assumed. Work Types may reuse a Journey
template. The current response remains `{matter_id,item_id,version}`; the
existing read contract exposes the new Current Stage without a UI change.

The existing request lock, UUID, saved response, optimistic version and Matter
locks are unchanged. A retry of a pre-081 create request returns its old saved
response without initializing that existing Matter. New create retries return
one Matter and one visit. Any initialization failure aborts the whole create,
including numbering, Lead, work state, Activity, audit and saved response.
Lifecycle remains active and Work State working. No historical Stage is inferred.

Replacing the new create branch with its original anchor reconstructs the
accepted 077 function definition byte-for-byte. Manual stage/skip, completion,
Next Action/actor, team, time, closing and reopening code is unchanged.

## Human gates and preservation

- Preflight: `scripts/sql/preflight_advisory_create_initial_stage_081.sql`.
- Post-Apply Verifier: `scripts/sql/verify_advisory_create_initial_stage_081.sql`.
- Both are static, self-contained SELECT-only queries and invoke no business RPC.
- The accepted 076 contract plus the accepted 077 function replacements form
  the exact precondition. Definition/security/grants and Stage-plan contracts
  are checked using the accepted C-ordered catalog projection.
- Preflight reports component differences, current per-table row counts/hashes,
  `rows_sha256` and `catalog_sha256`. Legitimate UAT rows are captured fresh.
- The migration locks 14 Advisory tables, captures rows/catalog before replacing
  the function, and raises if any rows/catalog differ afterward. No business-row
  writes are allowed during the migration.
- The verifier compares the exact intended new function contract, unchanged
  RPC security, all 14 Advisory table catalogs and all 14 row fingerprints.
  Unset Matters, existing visits and legacy identities remain untouched.
- Textual catalog/row sorting uses C collation; column and Stage positions use
  numeric ordering. Function definitions remain byte-sensitive.

## Reviewed Production baseline binding

Human-reviewed Preflight: `gate_pass=true`, `failed_checks=[]`,
`object_differences=[]`, `business_rpc_executed=false`.
The accepted 077 contract SHA remains
`f85937506d3fec583f084873c6ef7be13155cd671ad87150401cd7785d20edb8`.

The baseline JSON and static verifier now pin exactly:

| Baseline | Human-reviewed SHA-256 |
| --- | --- |
| `rows_sha256` | `b070a6de7383b74902693822ccab7a5fb2b17bb90965f8c5cf542fbcfeef37e8` |
| `catalog_sha256` | `0d9fbb5a5e1c05da206abf934753a5318de35e8cd7ce1463216e4b28a0c70491` |

No fixture values replaced either hash. The row aggregate covers all 14 original
per-table counts and fingerprints, including the reviewed 10 Matters, 8 visits,
25 Stage rows, 4 controls, 5 Tasks, 13 Issues, 94 Time logs, 17 requests,
17 Activities and 3 Work State events. No missing component hashes were invented.

Binding changed only six baseline literal occurrences in the verifier. Its
SELECT-only query, exact function/security contract, preservation logic and
`broader_finance_differences_accepted=false` remain unchanged. The artifact
builder, Preflight and Migration 081 are byte-for-byte unchanged. Immutable
076/077 and all other migration bytes remain unchanged.

Focused binding validation: **4/4 local gate tests pass**. Actual disposable
row, history, deletion, column, policy, privilege and function changes are
rejected. The delivered Production-bound verifier rejects synthetic fixture
rows. A separately labeled, in-memory digest-boundary simulation of the same
SQL accepts the exact reviewed hashes and rejects either changed hash; this
does not claim Production execution or reconstruct Production data. The
unbound-verifier failure test remains intact. Artifact consistency, touched-test
ESLint and diff/whitespace checks pass. No UI/type/build rerun was needed for
this binding-only change.

Files changed for binding: verifier SQL, baseline JSON, focused tests and this
document. All other worktree bytes were preserved. That Human Apply Gate and its
post-apply verification are now complete. No Production SQL was executed by the
agent. The verifier records the immediate post-apply preservation state; later
legitimate writes change row hashes and require review rather than being
classified automatically as migration drift. No broader Finance differences
are accepted.

## Repository release and Human Production UAT

Release scope is exactly the seven prepared 081 migration/gate/test/documentation
files. Only this closeout document changed during release preparation. Migration
081, both static gates, builder, tests and reviewed baseline remain byte-for-byte
unchanged from the approved artifacts. All unrelated tracked/untracked files,
applied migrations 076–080, UI, Case and Finance remain unchanged.

Final release validation: **52/52 targeted PostgreSQL tests pass** (17 for 081,
35 relevant 076/077 regressions). Artifact consistency, touched-file ESLint and
diff/whitespace checks pass. No TypeScript or local production build rerun is
needed because application files did not change. The established Vercel Git
integration follows the `origin/main` push; the release response records the
resulting commit and deployment evidence. No separate duplicate deployment is
required.

Stop for Human Production UAT:

1. As an active Admin, open `/advisory` and choose Create matter / สร้างงานนอกคดี.
2. Select an existing authorized client, enter a distinct UAT title, choose
   General Advisory and an eligible Lead, and save once.
3. Confirm the new Matter immediately shows the first Stage from its actual
   plan, lifecycle Open, Work State Working, and the selected Lead. Opening
   the Journey Map is optional; no manual Start Stage action should be needed.
4. Refresh the detail and check that the Current Stage remains the same, the
   Stage start time reflects this creation, and no extra creation/Stage event
   appears. Next Action remains honestly unset until explicitly assigned.
5. Repeat with Legal Opinion, Contract Review and HR/Employment when authorized;
   the last two may share the same Journey. Each starts at its own plan's first
   non-terminal Stage, never Close.
6. Read an existing legacy Matter with an unset Stage and a Matter with existing
   history; confirm neither was initialized or backfilled. The agent does not
   create UAT Matters, perform Human UAT, or alter those historical records.

## Candidate preparation validation (preceding baseline binding)

- 081: 16/16 tests in each of `en_US.UTF-8` and `C` on disposable PostgreSQL 18.
  The exact candidate SQL is applied without rebasing its guard. Covers all five
  Journey templates, shared Work Types, real create time, exactly one visit,
  independent-session retries/numbering, complete rollback on failure, original
  saved-response retries, preservation and operational regressions.
- Preflight and candidate reject simulated function privilege, Stage policy and
  template drift. Bound synthetic verifier passes; unbound verifier and simulated
  row/deletion/history/column/policy/grant/function drift fail closed.
- 076/077 PostgreSQL regressions: 35/35. Current Advisory UI regressions: 58/58.
- Existing Client combobox browser regression passes TH/EN at 390/768/1024/1440:
  selection, free-text rejection, stale search response, create submission,
  lookup failure, layout and no overflow; no console errors. Synthetic localhost
  only, no Production or external requests.
- Touched-file ESLint, TypeScript (`--noEmit --incremental false`), production
  build, artifact consistency and whitespace/diff review pass.

Candidate preparation added this document, the migration, two static gates,
the offline artifact builder, disposable PostgreSQL tests and the initially
empty verifier-baseline JSON, now bound as recorded above.
