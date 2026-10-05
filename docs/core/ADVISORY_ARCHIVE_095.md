# Advisory UAT operational archive — Migration 095

Status: Human reports Migration 095 Applied + Verified PASS. Migration 095 is immutable. The application release switches operational consumers to the installed archive-aware views; no Production SQL or data mutation is part of the release. The original gate commands below are retained as historical procedure, not instructions to reapply.

Project guard: `/Users/paolawyer/vp-case-app/vp-case-web`, branch `main`, starting HEAD `5403630792da97e4febf6e0ad5d7b5e87edccd5b`. Existing tracked/untracked work is preserved, including the pre-existing Visual Asset CSS edit. Existing migrations 001–094 are unchanged.

## Reviewed identities

The Human-provided preview in attachment `90e75d9f-56c4-4a04-ab59-f723d6e6c21c/pasted-text.txt` is the authority. Its exact UUID/number pairs and source digest are recorded in `scripts/tests/fixtures/advisory-095-reviewed-targets.json`.

| Matter | UUID |
| --- | --- |
| ADV-2026-013 | 8f375864-0fb3-4d17-9e07-d4f6d76cf4fe |
| ADV-2026-014 | 7583d780-9e98-4852-bf5a-98c40fbf8072 |
| ADV-2026-015 | 02e5ba61-af9b-4dc0-8729-9e334639b652 |
| ADV-2026-016 | c9aa7141-ed6a-4cdd-926a-ad261fb93dd6 |
| ADV-2026-017 | 47bfb55e-3ac5-445c-b335-5d48417f793e |
| ADV-2026-018 | 7442060f-5a6b-4235-a826-597a6a53bb37 |
| ADV-2026-019 | b02ba4f6-ccc8-43df-91d1-9d584ef6a7e0 |
| ADV-2026-020 | 6c717f2e-aff6-44af-9774-e910d7a61047 |
| ADV-2026-021 | 35583652-f594-4d7b-8f6a-24991df14dad |
| ADV-2026-022 | 50221a99-f188-4f18-9017-b6f3302a5c2f |
| ADV-2026-023 | 8cf4af68-18cd-415f-a56e-578e4ccaa2d1 |

ADV-2026-004..012 are protected. No name, creation date, snapshot presence, or legacy-origin heuristic selects cleanup targets.

## Contract

`advisory_matter_archives` is the canonical operational archive marker, separate from lifecycle. It stores the Matter ID/number, timestamp, active Admin actor, reason, request ID, reviewed Matter fingerprint, and reviewed baseline. Existing Matter rows and all child/history rows stay byte-for-byte unchanged. Archive markers are immutable; this release adds no restore action.

`advisory095_archive_uat(uuid,text,jsonb)` accepts a request ID, reason, and reviewed hashes. It only archives the hardcoded eleven pairs. It checks active Admin authorization, takes deterministic locks, re-reads identities and preservation evidence, and inserts all eleven markers in one transaction. It fails on identity/row/catalog drift or direct Finance/Case ownership references. An identical retry returns the same archived result without another insert. Ordinary users cannot invoke the operation successfully, inspect private capture helpers, or write marker rows directly.

Existing lifecycle, audit, and snapshot-immutability triggers remain enabled and unchanged. Added parent-aware guards prevent further operational writes to archived Matters and their owned rows. Base tables remain available under their existing permissions for historical and Finance references.

The preservation capture covers every existing public base table, auth users, Storage buckets/objects, public object definitions/grants, the target fingerprints, and the reviewed special evidence. No business RPC runs during Preflight or Verifier. The accepted Advisory contract is derived from accepted 076–087 artifacts, including the Human-reviewed 087 catalog pin; the new local fixture does not replace those pins.

Preserved categories include Clients (including the shared UAT Prospect), People/auth, Finance/Case, case audit logs, request receipts, activities, team, tasks/issues/advice, time, deliverables, closing evidence, Journey snapshots/visits/templates/versions, assets/Storage, and number counters. No external Drive/Docs action exists in these scripts. The reviewed 014 audit evidence, 023's 90 minutes, and 019..023 snapshots are explicitly checked.

The one-time operation briefly takes SHARE locks across the preservation scope, including Finance/Case tables, auth users, and Storage metadata. It does not write those tables. The Human Apply uses a 5-second lock timeout and a 120-second statement timeout; contention or any error rolls back the complete install/archive transaction.

## Operational reads

Five `security_invoker` / `security_barrier` views centralize the archive filter while retaining base-table RLS:

- `advisory_operational_matters`
- `advisory_operational_issues`
- `advisory_operational_tasks`
- `advisory_operational_time`
- `advisory_operational_advice`

Four existing read RPCs change only their Matter relation reads to the operational view: `advisory_control_read`, `advisory_control_section`, `advisory_overdue_work`, and `advisory_workflow_checks`. Their output shapes, calculations, permissions, and workflow rules remain the same.

Application consumers use the shared `lib/advisory-operational.ts` relation map: dashboard, calendar, operational reports/workload, Client summaries, legacy operational navigation, and Matter dialog/read selectors. Independently loaded tasks/issues/time are filtered at the view, rather than relying on a previously fetched parent list. Finance historical reads and Time insert targets stay on canonical tables.

This application release completes direct dashboard/calendar/workload and Client read integration. The DB Verifier proves the installed contract and archived state. Before release, a refreshed read-only Production Matter list independently showed only ADV-2026-004..012 (nine records; seven open), with no 013..023 entries.

## Human sequence

Candidate: `supabase/migrations/202610050095_advisory_uat_operational_archive.sql`

SHA-256: `411182e4bed6f1ca2b4505aa765a1ef7aa0774f22f00e0769e5dffd72cec63c7`

1. Copy the SELECT-only Preflight for Human execution:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_advisory_archive_095.sql
```

2. Human reviews `gate_pass`, failed checks, target/special evidence, and `rows_sha256`, `preserved_sha256`, `targets_sha256`. Human also identifies the authorized active Admin UUID from the returned eligible actors. The request UUID must identify this cleanup operation. No actor is guessed or automatically selected.

3. Bind those reviewed values locally using the artifact builder's `--bind ROWS_SHA PRESERVED_SHA TARGETS_SHA ADMIN_UUID REQUEST_UUID` operation, then run `--check`. Binding does not change the migration candidate. The fixture is now bound to the Human-reviewed hashes, Admin `52b8fea2-2558-4b76-a92b-2d332c0fee8e`, and request `1d10cab4-4db0-45ee-8144-07b1fd0b5765`. The unbound form raises `ADVISORY095_HUMAN_BASELINE_AND_ACTOR_NOT_BOUND` before DDL and its Verifier cannot pass. Human has already executed and verified this bound operation; do not reapply it.

4. Only after binding and Human approval, copy the complete Human Apply script:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/apply_advisory_archive_095.sql
```

This script installs 095 and invokes the exact eleven-Matter archive operation inside one outer transaction. The raw migration alone is install-only and is not the cleanup command. Human must execute the complete Apply script, not a selected statement fragment.

5. Copy the SELECT-only Post-Apply Verifier:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/verify_advisory_archive_095.sql
```

Any baseline drift requires review and a fresh Preflight; do not substitute current hashes without Human review.

## Local validation

- Five isolated PostgreSQL 18 tests pass: exact accepted foundation/candidate, authorization, stale identities/baselines, rollback including late failure, concurrent writer/retry behavior, operational exclusion, preserved historical reads, and grant/trigger/data drift detection.
- Five archive static/read-contract tests pass; 28 existing Legacy Archive and Client Workspace regressions pass (33 tests in the combined application/static run).
- Artifact consistency passes. Preflight/Verifier execute successfully in local read-only transactions and contain one SELECT statement.
- Release validation: 38 targeted PostgreSQL/application/static tests pass. TypeScript, touched-file ESLint, production build, and diff/whitespace checks pass.
- Isolated browser coverage checks TH/EN at 1440px and 390px: protected Matters remain; archived canaries do not appear in Matter list/search/overdue, Client summaries, dashboard, or calendar. No external requests or business mutations are permitted by the fixture. The preview-only loader removes Next styled-JSX marker attributes while retaining CSS, since the isolated compiler is not the Next build pipeline.
- PostgreSQL tests use disposable local synthetic data over a private Unix socket. No Production connection or business operation was used.

## Files in this task

New:

- `docs/core/ADVISORY_ARCHIVE_095.md`
- `lib/advisory-operational.ts`
- `supabase/migrations/202610050095_advisory_uat_operational_archive.sql`
- `scripts/sql/advisory_archive_095_contract.sql`
- `scripts/sql/preflight_advisory_archive_095.sql`
- `scripts/sql/apply_advisory_archive_095.sql`
- `scripts/sql/verify_advisory_archive_095.sql`
- `scripts/tests/advisory-archive-artifacts.cjs`
- `scripts/tests/advisory-archive-postgres.test.cjs`
- `scripts/tests/advisory-archive.test.cjs`
- `scripts/tests/advisory-archive-browser.cjs`
- `scripts/tests/fixtures/advisory-archive-preview.js`
- `scripts/tests/fixtures/advisory-095-contract.json`
- `scripts/tests/fixtures/advisory-095-reviewed-targets.json`
- `scripts/tests/fixtures/advisory-095-reviewed-baseline.json`

Modified:

- `app/advisory/control/MatterEditor.tsx`
- `app/advisory/control/MatterNextAction.tsx`
- `app/advisory/control/MatterTime.tsx`
- `app/advisory/control/MatterWorkflowDialog.tsx`
- `app/advisory/reports/page.tsx`
- `app/calendar/page.tsx`
- `app/clients/page.tsx`
- `app/dashboard/page.tsx`
- `app/reports/daily-workload/page.tsx`
- `app/reports/workload-summary/page.tsx`
- `app/workload/office-work/page.tsx`
- `lib/advisory-legacy-archive.ts`
- `lib/client-workspace-read.ts`
- `scripts/tests/advisory-legacy-archive.test.cjs`
- `scripts/tests/client-workspace.test.cjs`
- `scripts/tests/fixtures/client-workspace.cjs`

- `scripts/tests/non-litigation-preview.cjs`
- `scripts/tests/fixtures/advisory-legacy-archive-preview.js`
