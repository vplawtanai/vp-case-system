# Phase 8C.1 — Operational workflow completion: Migration Human Gate

Status: **PRODUCTION MANUALLY APPLIED; POST-APPLY VERIFIER PASSED** (Human Gate report).

The user confirmed `gate_pass=true`, `failed_checks=[]`, and `applied_state_exact=true`
before authorizing the Phase 8C.1 application release. Migration 077 is immutable.
No SQL is executed by this release. The sections below preserve the historical
gate-preparation evidence; their pre-apply instructions are not current actions.
Application release scope and validation are recorded in
[PHASE8C1_OPERATIONAL_WORKFLOW_APP.md](PHASE8C1_OPERATIONAL_WORKFLOW_APP.md).

## Reviewed Production baseline bound — Human Apply Gate

Human-reviewed corrected Production Preflight: `gate_pass=true`,
`failed_checks=[]`. Candidate 077 remains
`b612e944cfd9334e3366bc1c74b116fd2e69b731aaee2018e9385bb226c31b0b`.
Accepted 076 contract remains
`86d20bac7582db6955e4b7f644221ee910e7ab41ab6457bbf48cefa1dacd3471`.

The existing offline binder now pins exactly the three reviewed aggregates:

| Baseline | Human-reviewed SHA-256 |
| --- | --- |
| `historical_rows_sha256` | `83ff1de3a3f242c01fa72018065f107834371424441933891ef62d49d45be046` |
| `legacy_rows_sha256` | `a8f2a479c612201f495bdbea8132656fc50d23a602e0a5f08ae80f2884343295` |
| `finance_references_sha256` | `2a0f0f1ea78103ccfe15f827b10e4163ce9ce14d9685cc6aa8a76cb0cb2c28b8` |

No local fixture baselines were substituted. These aggregates cover the existing
per-table counts/row fingerprints and Finance reference counts/row fingerprints/
orphan counts. No separately supplied component baseline is required by this
verifier architecture; none was invented. Current legitimate UAT operational rows
belong to this reviewed baseline. All checked Finance orphan counts were zero;
`broader_finance_differences_accepted=false` remains unchanged.

The exact intended 077 function/security contract is checked separately from
business-row preservation. Migration 077 creates no persistent business rows;
there is no permitted row-change exception. Unexpected updates, deletions,
reference changes, disappearance of referenced rows and orphaning still fail
closed through the existing hashes. The verifier remains SELECT-only and does
not invoke write/business RPCs.

Binding changed only the baseline JSON and generated verifier SQL; tests and
this gate document record the reviewed identity and failure cases. Migration
076/077, Preflight, builder, expected function definitions/security, UI, Case,
Finance business logic/data and unrelated files are unchanged.

Binding validation: **19/19 PostgreSQL tests in each of C and en_US.UTF-8**;
**60/60 existing regressions**. Includes preservation, independent-session races,
retry, rollback, exact Production pins, unbound failure, bound synthetic pass,
real Production pins rejecting synthetic rows, and negative row/schema/policy/
grant/Finance amount/reference/deletion/orphan tests. All synthetic negative
changes are rolled back in disposable local PostgreSQL only.
Targeted ESLint, TypeScript `tsc --noEmit`, production build (exit 0), artifact
consistency and diff/whitespace checks pass. Final byte audit: only four files
changed (bound baseline JSON, verifier, tests, this document); the verifier differs
from its unbound form only in six baseline literal positions. Both migrations,
Preflight and all unrelated files are unchanged. HEAD and origin/main remain
`e21925f653c62a0cb85ab8207a0bb523750128e5`; nothing staged, committed or deployed.

## Accepted 076 ordering correction — preceding gate evidence

Production reported only `accepted_076_contract` failing. Legitimate post-076
UAT rows are not part of that catalog fingerprint and are not treated as drift.
Human Production diagnostic now confirms `conclusion=fingerprint_ordering_only`,
`c_order_fingerprint_matches=true`, and the accepted hash below. There is no
Production drift in this scoped 076 contract. No Production query was executed
by the agent.

The 077 builder reused the older `appliedSql()` default-collation catalog sorts.
The committed, human-accepted 076 attempt-state verifier already used explicit
`COLLATE "C"` for those same sorts. The correction now makes both embedded 077
candidate guards and the read-only Preflight/Verifier projection byte-for-byte
identical to that accepted projection, through a single shared builder.
No expected definition, ACL, security, policy, historical hash or business contract
was changed. The broader 490 differences remain outside scoped acceptance.

Reproduced on disposable PostgreSQL with `en_US.UTF-8`: all object definitions
match; only the index array order differs for `advisory_matter_team`,
`advisory_stage_visits`, `advisory_matter_activities` and
`advisory_work_state_events`. Default-order hash:
`cb03752112bdea633b5418a3cbb4f5f0823857c5fef0c8afa304fd07da7ef9bb`.
C-order hash matches the unchanged accepted hash:
`86d20bac7582db6955e4b7f644221ee910e7ab41ab6457bbf48cefa1dacd3471`.
The Human Production diagnostic independently confirmed exactly these four
ordering-only differences, with all definitions matching. The original diagnostic
SQL remains unchanged as evidence for the obsolete candidate.

The static diagnostic inspects only the 8 new tables, 11 functions and the
076 additions on 4 existing tables. It returns per-object/per-component evidence,
raw/C hashes and separate missing/extra, definition, security, policy, trigger
and order-only differences. No business rows or business RPCs are read/invoked.

Exact accepted fingerprint: SHA-256 over UTF-8 PostgreSQL `jsonb::text`, with
three keys (not the separate historical/Finance row fingerprints):

- `tables`: `advisory_matter_control`, `advisory_matter_team`,
  `advisory_matter_stages`, `advisory_stage_visits`, `advisory_work_state_events`,
  `advisory_matter_activities`, `advisory_deliverables`, `advisory_control_requests`.
  Includes schema/kind/owner, RLS enabled/forced, raw ACL, ordered columns
  (type/nullability/default/identity/generated/column ACL), constraints and
  validation, incoming FKs, indexes, triggers and enabled flags, policies and
  effective anon/authenticated/service_role table privileges.
- `functions`: `advisory076_allowed(text)`,
  `advisory076_check_person(uuid,boolean)`, `advisory076_template(text)`,
  `advisory076_task_guard()`, `advisory076_task_activity()`,
  `advisory076_time_guard()`, `advisory076_issue_guard()`,
  `advisory076_lifecycle_guard()`, `advisory_control_read(uuid,jsonb)`,
  `advisory_control_write(uuid,text,jsonb,uuid,bigint)`,
  `advisory_control_section(uuid,text,integer,uuid)`.
  Includes identity/signature keys, definition, owner, definer, volatility,
  config/search_path, raw ACL and effective EXECUTE for the three API roles.
  Additional overloads/helpers in the original query scope remain detectable.
- `deltas`: only the 076 additions on `advisory_matters`, `advisory_issues`,
  `advisory_issue_tasks`, `advisory_time_logs`: prefixed constraints/indexes/
  triggers, selected Task Matter/Issue/assignee/Stage columns and Time Stage.

Definitions/security remain byte-sensitive; whitespace-folding output is only
a diagnostic hint, never a reason to accept a mismatch. Array sorts use explicit
C order where textual; physical column order remains numeric attribute order.

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/diagnose_non_litigation_076_contract_for_077.sql
```

The old candidate SHA
`5d2c035cc046b82d6029352435994643bb9525d042164fb293ef047adcb953c7`
is **obsolete and must not be applied**. Corrected candidate SHA:
`b612e944cfd9334e3366bc1c74b116fd2e69b731aaee2018e9385bb226c31b0b`.
The corrected SELECT-only Production Preflight has since passed Human Review.
Migration 076 remains unchanged; the verifier is now bound as recorded above.
Production Apply remains a Human Gate; the agent has not executed Production SQL.

Focused validation: **18/18 disposable PostgreSQL tests PASS in each of C and
en_US.UTF-8**, including the
read-only diagnostic, exact accepted projection, ordering reproduction, and
rollback-isolated negative cases for grants, function security, missing/extra
objects, policy, trigger and index changes. Existing workflow/concurrency tests
also pass. In both locales the unmodified candidate passes the exact accepted
076 hash before rejecting the separate synthetic legacy catalog. Only legacy
catalog/helper hashes are rebound in in-memory test copies; the accepted 076
contract is never rebound. Reversing only the two C-order projection replacements
reconstructs the entire obsolete candidate SHA, proving every business SQL byte,
expected definition/security and preservation assertion remains unchanged.
The 076/preflight/UI/refinement/Overview/lifecycle regressions pass **60/60**.
Targeted ESLint, TypeScript `tsc --noEmit`, production build, artifact consistency
and diff/whitespace review pass. The sandboxed Turbopack run stalled and was
stopped; the approved build outside the sandbox completed with exit 0.
A before/after byte audit confirms only seven existing 077 gate/migration/test/doc
files changed. The applied-functions fixture changed only its candidate SHA;
Preflight/Verifier changed only their SHA identity from the already-corrected
read gates. The original diagnostic, unbound row-baseline fixture, Migration 076,
all tracked application files and unrelated untracked files remain unchanged.

Project: `/Users/paolawyer/vp-case-app/vp-case-web`, `main`.
Starting HEAD and local `origin/main`: `e21925f653c62a0cb85ab8207a0bb523750128e5`.
All tracked files were clean at entry; 34 unrelated untracked files are preserved.
The approved reference image is visual/behavior guidance, never source records.

## Inspection and exact backend gaps

Applied Migration 076 remains immutable. Its SHA is
`c67ac32ef0572964fcacc31bfc54dbe73544b76a4719436b6afa4a4c67a61afe`.

1. `advisory_control_write` only has `stage`/`stage_skip`. A transition closes a
   visit as `transition`, does not inspect Stage Tasks, does not resolve Next
   Action, and does not derive the next ordered Stage. Several independent UI
   RPCs would not make this atomic. A pre-save UI count cannot prevent races.
2. Existing `team` adds/removes a `(matter_id,user_id,team_role)` tuple. Changing
   role through the existing editor adds the new role without removing the old
   one. Atomic role replacement needs a contract; multi-role membership remains
   permitted, and the existing unique one-Lead rule must remain intact.
3. Existing `close` requires a summary but does not inspect outstanding Tasks,
   Next Action, Deliverables or Journey readiness. Closing and Task insertion
   must serialize on the same Matter lock. The old raw Task trigger locks that
   row but does not reject new work after closure/completion.
4. Existing Reopen already requires manage permission and reason, records
   Activity, sets lifecycle active/work state working, and leaves Stage unset.
   Legacy completed/cancelled Matters without a control closing timestamp need
   explicit controlled reopening rather than becoming editable accidentally.

These are backend-contract changes; the task explicitly requires stopping at
Migration Human Gate. **No partial UI implementation was made.** There are no
screenshots of simulated persistence, no frontend release and no new workflow
claimed as already available in Production.

## Existing contracts that can be reused after the gate

- Linked Next Action already derives title, assignee and due date from the Task.
  Its completion/cancellation/soft deletion clears the link through the existing
  Task Activity trigger. Reassignment is reflected by the existing read join.
  Lead and Current Actor are separate. No duplicated Next Action columns needed.
- Team roles are `lead`, `co_work`, `assistant`, `qa`; multiple roles per person
  are allowed by the existing key. No start-date column exists: the future Add
  form must not ask for or invent one. The existing eligible People pool is
  active + operational + assignable, with legal-role qualification for Lead.
  Task assignees need not be Team members. No new membership prerequisite.
- `advisory_time_logs` remains the sole Time ledger. It already supports nullable
  `stage_id`, work date, integer minutes, work type, note and creator identity.
  New Matter-scoped UI can insert/read it under existing RLS, deriving the
  current Stage and signed-in recorder. Staff/Lawyer own-Time visibility and
  Admin/Partner visibility remain unchanged. No delegated time-entry policy is
  added. Legacy null-Stage logs remain valid effort; no backfill or new ledger.
- Closing outcome/summary/follow-up/Case reference and real closing timestamp
  already exist. Actor and previous outcome are preserved in Activity. No new
  outcome column or Case write is necessary.
- Structured Lead ID remains authoritative; the old responsible-lawyer text
  remains evidence/fallback, not a confirmed Team member. No identity matching.

## Proposed 077 contract

Candidate: `supabase/migrations/202607180077_non_litigation_operational_workflow.sql`.
SHA-256: `b612e944cfd9334e3366bc1c74b116fd2e69b731aaee2018e9385bb226c31b0b`.

Only three function contracts change. **No tables, columns, indexes, policies,
grants on existing functions/tables, or triggers are added/removed.**

| Function | Change |
| --- | --- |
| `advisory_control_write(uuid,text,jsonb,uuid,bigint)` | Preserve signature, security, version/idempotency ledger and original actions. Add `stage_complete`, `team_edit`; guard manual transitions and closing; explicitly reopen legacy completed/cancelled Matter. |
| `advisory076_task_guard()` | Replace body in NEW 077 only. Keep all original relationship/identity/completion checks and parent row lock; reject Task writes on closed Matters and new/reopened incomplete Tasks into explicitly completed non-current Stages. Existing rows are untouched. |
| `advisory_workflow_checks(uuid)` | New read-only SECURITY INVOKER RPC. Existing read-role guard. Returns current visit/Stage, pending counts, Next Action presence, Journey readiness, legacy-without-plan indicator. No Time data or privilege widening. Authenticated EXECUTE only; PUBLIC/anon/service_role revoked. |

### Stage completion

Payload: current `visit_id` plus optional `resolve_next_action=true`. The existing
expected version and request UUID are still mandatory.

- Lock request and Matter/control; verify exact current visit.
- Block incomplete current-Stage Tasks by canonical status (even a legacy
  inconsistent completed timestamp cannot make an in-progress Task complete).
  **No Stage override**, including Admin/Lead.
- Derive the next ordered, non-skipped plan Stage server-side. A linked Task
  already belonging to that next operational Stage remains Next Action. Any
  standalone or other-Stage/Matter-level Next Action requires explicit resolution
  before clearing. Clearing does not complete or delete its Task.
- End current real visit with `exit_reason=completed`; begin next real visit at
  the same transition timestamp. Record one Activity with Stage IDs/keys,
  entered/completed timestamps and next step. Exact retry returns original result.
- The terminal `close` plan marker does not get an invented visit and never
  silently flips lifecycle. Finish the last operational visit, return
  `ready_for_closing=true`, then use the separate closing flow. Checklist can
  still block closing for other outstanding work.
- Existing manual Stage selection cannot bypass current-Stage Task or Next
  Action guards. It remains a deliberate correction with its existing Activity.
- Work State is not automatically changed by Stage progression.

### Team and closure

`team_edit` requires the exact user and previous role, checks eligibility, rejects
collision with another existing role/Lead, and replaces only that one membership
in the same transaction. Existing add/remove and multi-role semantics remain.
The future UI must distinguish Add/Edit/Remove and explain Lead replacement.

Successful `completed`/`agreement` closure requires no pending Tasks, no Next
Action, all Deliverables delivered/cancelled, no current visit, and no unvisited
nonterminal planned Stages. Explicit skips and recorded historical exited visits
remain evidence; no prior history is rewritten. Legacy Matter with no plan is
reported honestly and does not need invented Stage visits to close.

Existing exceptional outcomes (`client_stopped`, `external_refusal`, `litigation`,
`cancelled`) can preserve unfinished work, but now require `unresolved_reason`
when checks are not ready. This narrows the old unrestricted close behavior; it
adds no role/override framework. The checklist/reason is retained in Activity;
Tasks and Deliverables are never marked complete by closure.

Reopen preserves the previous closure in Activity, needs a reason, clears no
historical visits, leaves current Stage unset and starts a real working interval.
The future UI must prompt for the next real Stage/Next Action. A legacy closed
Matter records its previous lifecycle without inventing an old closing date.

### Lifecycle `waiting`

The legacy Matter status column is text (not a new Work State enum). Migration
076 explicitly permits `active` or `waiting` while control is open. Thus
`waiting` is an accepted **legacy lifecycle compatibility value**, not an alias
for `waiting_client`/`waiting_external`/`waiting_internal` in control Work State.
New controlled creation uses `active`, close uses `completed`/`cancelled`, reopen
uses `active`. 077 neither writes `waiting` nor converts existing values. The
current lifecycle badge resolver and all app code remain unchanged.

## Preservation and manual gates

The transaction fails closed unless schema/function/security matches the
accepted 076 contract and reviewed historical helper/catalog evidence. Production
baseline is never replaced with the local synthetic fixture. The broader 490
Finance differences remain outside acceptance.

All scoped existing/new Advisory rows, historical names/Time/Tasks/Issues/Advice,
control/team/visits/activity/request history, profiles/clients/advisory audit,
counters and Finance reference fingerprints are captured **fresh at transaction
start**, under scoped locks, and compared before commit. No business DML runs in
the migration. Existing function ACL/owner/definer/config/volatility are asserted
unchanged. All 001–076 migration bytes remain unchanged.

The corrected SELECT-only preflight passed Human Review:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_non_litigation_operational_workflow_077.sql
```

It reported fresh `historical_rows_sha256`, `legacy_rows_sha256` and
`finance_references_sha256`, bound above without a full baseline JSON transfer.
The next action is the user's manual Migration Apply Gate, after local checks.

The static post-apply verifier at
`scripts/sql/verify_non_litigation_operational_workflow_077.sql` is now **bound to
the reviewed Production aggregates**. It is prepared for the later post-apply
step, not for execution before the Human Apply Gate. No stale 076 row counts
are accepted. The offline binding used exactly:

```text
node scripts/tests/non-litigation-workflow-artifacts.cjs --bind-verifier 83ff1de3a3f242c01fa72018065f107834371424441933891ef62d49d45be046 a8f2a479c612201f495bdbea8132656fc50d23a602e0a5f08ae80f2884343295 2a0f0f1ea78103ccfe15f827b10e4163ce9ce14d9685cc6aa8a76cb0cb2c28b8
```

## Validation and limits

- **19/19 local PostgreSQL tests PASS per locale**, real independent sessions,
  disposable Unix sockets only, `C` and `en_US.UTF-8`. Covers preservation, rollback restoration,
  fail-closed baselines/security, readonly verifier, permissions, Stage/Next Action,
  Team collisions, original Time RLS, closure/reopen, concurrency/retry, and
  Task insertion racing with Stage completion/closure.
- Synthetic legacy catalog/helper hashes differ from accepted Production evidence.
  Only those hashes in in-memory test copies bind to that synthetic database;
  the actual candidate passes accepted 076 then rejects its synthetic legacy
  catalog. Repository Production hashes stay accepted.
- Local verifier executes in `BEGIN READ ONLY`; rejects unbound baseline, row
  tampering and ACL widening; bound synthetic verifier passes. Local rollback
  rehearsal restores the exact snapshot.
- Existing 076 and Preflight database + Advisory lifecycle/UI/Overview/refinement
  regressions: **60/60 PASS** (includes 37 UI regression tests).
- Targeted ESLint, artifact consistency, final function diff review and
  `git diff --check` PASS; whitespace checks also cover all eight new files.
- TypeScript `tsc --noEmit` and production build PASS. The initial sandboxed
  Turbopack build stalled; it was stopped and the permitted local build passed.
  No application files changed. This is the user-required migration stop, not
  a completed operational UI release. Responsive screenshots remain deferred.
- Mockup UI, combobox, Time tab/modal, Stage/close confirmation, TH/EN and
  390/768/1024/1440 interaction smoke remain to be implemented after the backend
  gate. No browser or Production UAT action was performed in this task.

## Intended new files only

1. `supabase/migrations/202607180077_non_litigation_operational_workflow.sql`
2. `scripts/sql/preflight_non_litigation_operational_workflow_077.sql`
3. `scripts/sql/verify_non_litigation_operational_workflow_077.sql`
4. `scripts/tests/non-litigation-workflow-artifacts.cjs`
5. `scripts/tests/non-litigation-workflow.test.cjs`
6. `scripts/tests/fixtures/non-litigation-077-applied-functions.json`
7. `scripts/tests/fixtures/non-litigation-077-verifier-baseline.json` (reviewed Production hashes, bound)
8. `docs/core/PHASE8C1_OPERATIONAL_WORKFLOW_GATE.md`

**NO PRODUCTION SQL APPLIED. NO COMMIT. NO PUSH. NO DEPLOY.**
Case and Finance business logic, application UI, applied migrations and unrelated
tracked/untracked files are unchanged. Stop for Migration Human Gate.
