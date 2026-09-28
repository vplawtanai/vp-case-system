# Phase 8C.1 — Operational workflow application review

Status: FINAL APPLICATION RELEASE APPROVED by Human Review, including basic Client navigation.
Migration 076/077 are applied immutable Production history. This application release does not run SQL or mutate Production business data.

## Guard and applied history

Repository: `/Users/paolawyer/vp-case-app/vp-case-web`; branch `main`.
Released starting HEAD and `origin/main`: `e21925f653c62a0cb85ab8207a0bb523750128e5`.
The user's latest Human Gate report establishes Migration 077 as applied with
`gate_pass=true`, empty failures, exact applied state, preserved rows/catalog/helpers,
reviewed row baseline and unchanged Finance references. Earlier gate-preparation
notes describe historical pre-apply steps, not the current Production state.

Immutable files remain byte-identical:

- 076: `c67ac32ef0572964fcacc31bfc54dbe73544b76a4719436b6afa4a4c67a61afe`
- 077: `b612e944cfd9334e3366bc1c74b116fd2e69b731aaee2018e9385bb226c31b0b`

## Implementation

1. Only the current Stage offers completion. The read-only `advisory_workflow_checks`
   supplies readiness; incomplete Stage Tasks are shown by name. A single versioned
   `advisory_control_write(stage_complete)` completes/advances. Explicit Next Action
   resolution never completes its Task. A valid next-stage Task is retained by the RPC.
   Final operational Stage completion opens controlled Close without flipping lifecycle.
   Viewing Journey nodes remains read-only; opening an action closes the map first.
2. Next Action selects an existing eligible Matter Task, derives its title/owner/due,
   or allows a standalone action. Current Actor never falls back to Lead. Completion
   refreshes the authoritative read; a cleared action has a Set next action CTA.
3. Team add / edit role / remove are separate dialogs. Person selection reuses the
   existing searchable combobox without editing its Finance source file. The existing
   People query restricts choices to active, operational, assignable profiles. Structured
   Lead is authoritative; replacing Lead requires explicit confirmation, while direct
   removal of the Lead is not offered. Legacy names remain untouched. Same-person,
   different-role memberships remain permitted; exact duplicate roles are blocked.
4. Time runs inside the Matter tab using existing `advisory_time_logs` and own-time RLS.
   Matter/client/current Stage are derived; signed-in recorder is read-only. Stage
   override is secondary. Existing work types, Other description, Core/Support and
   legacy null-Stage records remain supported. Stable insert UUID and exact payload
   comparison recover a lost response without duplicating a Time row. No second ledger.
5. Close shows backend task/Next Action/deliverable/Stage readiness. Successful outcomes
   remain blocked until ready. Exceptional outcomes require a resolution when blocked.
   Reopen requires a reason, retains history and never reconstructs Stage visits.
   Human-readable Activity shows the automatic Stage and team transitions.

Lifecycle tokens remain active blue / completed green / cancelled muted red /
legacy waiting yellow. Work State stays independent. Recorded Journey without a
current Stage is distinguished from a legacy Matter that never recorded a plan.

6. No Client Detail route exists at `/clients/[id]`; only the Client list and a
   separate tax-identity route exist. The Matter header and Other Client Matters
   client-name links now use `/advisory?client_id=<encoded id>`, matching View all.
   The existing list sends the client filter to the read contract. No new route or
   Client Workspace was added. Browser coverage checks both links and View all in
   TH/EN at every responsive width, excluding a different-client canary.

## Contract / policy boundaries

No required backend gap was found for these workstreams. Task assignees are NOT
required to be Team members: 077 permits an eligible non-member, and the app preserves
that policy. Any future Team-only assignment policy needs a separate product decision.
Time totals/list reflect existing visibility permissions; this is not a new all-staff
ledger or billing feature. Existing records remain available as a secondary history link.
No branching, custom Journey authoring, Case work, Finance logic, identity mapping,
historical backfill, or new migration was added.

## Validation and review evidence

- Local PostgreSQL: 42/42 (076 contracts/preflight regressions + 077 en_US.UTF-8).
- Local PostgreSQL 077 C locale: 19/19. Includes independent sessions for duplicate
  advance/retry, Stage versus Task insertion and Close versus Task insertion; rollback,
  preservation, exact security, deterministic fingerprint and verifier tamper rejection.
- UI/model regression tests: 56/56 (37 existing + 19 operational tests).
- Browser synthetic checks: 139 passed across TH/EN at 390, 768, 1024, 1440.
  Includes add/edit/remove/duplicate Team, Matter Time/default Stage/legacy Time,
  Stage block/advance/terminal close, Next Action completion, controlled close/reopen,
  lost-response replay, read-only Journey inspection and no nested dialogs.
- Targeted ESLint, `tsc --noEmit`, production build and `git diff --check`: PASS.
- Browser: no console/runtime errors, external requests, page/modal horizontal overflow.
- Screenshots reviewed locally. All business data shown is synthetic and remains in
  browser memory; refresh resets it. No Human Production UAT was performed.

Final release browser report/screenshots: `/private/tmp/advisory077-release-ui/result.json`
Validation logs: `/private/tmp/advisory077-release-*.log`

Reproduce the local mock with `ADVISORY_WORKFLOW_PREVIEW=1 node scripts/tests/non-litigation-preview.cjs`.
Use the printed localhost origin with
`node scripts/tests/non-litigation-operational-browser.cjs http://127.0.0.1:PORT`.
The browser runner rejects non-localhost targets. It uses the available Playwright
runtime (override with `VP_PLAYWRIGHT_PATH`) and installed Chrome.

## Exact application files in this release

- `app/advisory/control/Journey.tsx`
- `app/advisory/control/MatterDetail.tsx`
- `app/advisory/control/MatterEditor.tsx`
- `app/advisory/control/MatterJourney.tsx`
- `app/advisory/control/MatterNextAction.tsx`
- `app/advisory/control/MatterOverview.tsx`
- `app/advisory/control/MatterSections.tsx`
- `app/advisory/control/MatterTeam.tsx`
- `app/advisory/control/MatterTime.tsx`
- `app/advisory/control/MatterTimeSummary.tsx`
- `app/advisory/control/MatterWorkflowDialog.tsx`
- `app/advisory/control/OtherClientMatters.tsx`
- `app/advisory/control/control.module.css`
- `app/advisory/control/overview.module.css`
- `app/advisory/control/workflow-shared.tsx`
- `docs/core/PHASE8C1_OPERATIONAL_WORKFLOW_APP.md`
- `lib/advisory-control.ts`
- `lib/advisory-workflow.ts`
- `lib/i18n/messages/advisory-control.ts`
- `scripts/tests/fixtures/non-litigation-operational-preview.js`
- `scripts/tests/non-litigation-operational-browser.cjs`
- `scripts/tests/non-litigation-operational-ui.test.cjs`
- `scripts/tests/non-litigation-preview.cjs`
- `scripts/tests/non-litigation-refinement.test.cjs`

## Applied migration / gate history included in this release

- `supabase/migrations/202607180077_non_litigation_operational_workflow.sql`
- `scripts/sql/preflight_non_litigation_operational_workflow_077.sql`
- `scripts/sql/verify_non_litigation_operational_workflow_077.sql`
- `scripts/sql/diagnose_non_litigation_076_contract_for_077.sql`
- `scripts/tests/non-litigation-workflow-artifacts.cjs`
- `scripts/tests/non-litigation-workflow.test.cjs`
- `scripts/tests/fixtures/non-litigation-077-applied-functions.json`
- `scripts/tests/fixtures/non-litigation-077-verifier-baseline.json`
- `docs/core/PHASE8C1_OPERATIONAL_WORKFLOW_GATE.md`

The diagnostic is required by the 077 PostgreSQL regression suite. All migration,
gate SQL, artifact builder and baseline fixture bytes are unchanged from their
Human Gate. Only the gate document status is updated to reflect the reported PASS.
34 unrelated pre-existing untracked files are excluded and preserved. Case and
Finance business logic are unchanged. Final Production UAT belongs to the user.
