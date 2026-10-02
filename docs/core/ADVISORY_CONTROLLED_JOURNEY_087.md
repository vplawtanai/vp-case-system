# Flexible Journey FJ-2 — Migration 087 Human Gate

Status: Migration 087 Human-applied and verified PASS. FJ-2 application release authorized; stop after release for Human Production UAT. Migration 087 is immutable.

Project: `/Users/paolawyer/vp-case-app/vp-case-web`, branch `main`.
Starting HEAD: `c3e3b0e029ac2dcc71e0ce04d59ecd361b3f2b43`.
Candidate: `supabase/migrations/202610020087_advisory_controlled_journey.sql`.
SHA-256: `ad03f638b774278c982a73f6472f03bef6887b478cab9b9dc15fa7a70729b41f`.
Accepted immutable 086 SHA: `71d07c7b59f86f8cc007f40b434d4b09b4980a9e507da23c2d4db3dc7c2f0dc7`.

## Contract

No new tables, columns, seeds or business-row writes. Migration 087 adds one private immutable validator, replaces two definition CHECK constraints, and replaces four existing RPC definitions (same signatures/security/grants): `advisory_journey_manage`, `advisory_control_write`, `advisory_control_read`, `advisory_workflow_checks`.

FJ-1 definitions remain valid and retain their original linear behavior. Admin explicitly enables controlled routes in a new version. A `format: 2` definition adds `conditional` and `outcomes` to each Stage. Each outcome has a stable key, Thai/English names, a target Stage key and `requires_reason`. Every operational stage has 1–8 outcomes; the existing closing marker has none. All stages must be reachable from intake and have a possible path to close; loops with an exit are allowed. The first and closing stages remain required and non-conditional.

Creation uses the existing FJ-1 family lock, latest-version validation, immutable snapshot and automatic first visit. The snapshot freezes stage labels/order, requirement flags, conditional flags and all outcome/route definitions. No existing version, snapshot, matter, plan, visit, activity or financial reference is backfilled or rewritten.

Completion reads the frozen snapshot. One outcome is selected automatically; multiple outcomes require a valid choice. Required reasons are nonblank, with a 4,000-character limit. Existing permissions, current-visit identity, expected control version, task and Next Action checks remain authoritative. The same transaction completes the current visit, opens a new target visit, writes outcome/reason/frozen labels/actor identity and name/time to existing Activity, and stores the existing idempotent request response. A loop always creates a new visit. The existing unique partial index still enforces at most one open visit.

An unchosen path creates no visit and no skip. Conditional stages remain possible routes until actually reached. Close remains the existing terminal plan marker: reaching it does not automatically close the Matter or invent a close visit. Existing task/deliverable/Next Action checks and the explicit Close action remain required; unchosen branches do not count as unfinished stages.

FJ-1 optional skipping is unchanged. In FJ-2, a skip can only waive the current optional Stage on an unambiguous linear route to the next non-conditional Stage, with no outcome-reason requirement. It cannot select outcomes, activate dormant branches, skip future conditional stages or bypass an outcome decision. Other optional branch points must use completion. A skip from a previous loop never removes the target from a later visit. Existing explicit reopening may resume a previously visited stage; live manual branch correction remains prohibited.

## UI

- Existing Admin-only route/API/navigation guards retained. Family → Variant → selected Stage → outcomes, target and reason requirement. Publishing creates a new version. No graph editor or per-Matter authoring.
- Existing create form derives family/default variant and freezes the chosen version. Conditional previews are labeled as possible routes.
- Matter Actual Path is derived only from recorded visits, preserving repeated loop visits (including beyond the old 20-visit per-stage preview). Possible routes are secondary and inspectable in a modal.
- Completion dialog shows Admin-defined outcome choices, target and reason, with a transaction summary. Duplicate submission stays locked through read-back. Refreshing to another visit discards the old outcome/reason selection.
- Decision history and Activity show frozen outcome, reason, actor and timestamp. React escapes text. TH/EN are separate display modes.

## Gate and preservation

Preflight and verifier are static SELECT-only catalog/row inspections. They execute no business/helper RPC and use deterministic C ordering. NOT NULL is checked through `pg_attribute.attnotnull`; PG18-only NOT NULL constraints are excluded from the constraint array, matching the accepted PG17/18 normalization.

The migration requires the exact accepted 086 contract/footprint, then compares the exact expected 087 contract/footprint. Existing owner, ACL/effective EXECUTE, RLS/policies, triggers, indexes, definitions and surrounding catalog are fingerprinted. Old Advisory/People/Client/Finance-reference preservation uses the existing gate contract; all four FJ-1 tables additionally include complete row fingerprints, including timestamps and legitimate UAT snapshots/history. No local fixture is a Production row baseline.

Post-apply verifier is bound to the exact Human-reviewed Production baseline: `rows_sha256 = 2f280643701d77922d96a15ddf0ef8eedf28dff1c5345f93499a6e1d1f195baf`, `catalog_sha256 = 0d9fbb5a5e1c05da206abf934753a5318de35e8cd7ce1463216e4b28a0c70491`. Binding changed only the verifier and baseline pin file, never the candidate. Human confirmed Applied + Verified PASS and authorized this application release. Do not rerun the migration or interpret later legitimate UAT writes against the immediate post-apply baseline.

1. Copy the SELECT-only Preflight; review the result.
2. Bind the exact reviewed hashes, reconfirm candidate SHA.
3. Human Apply only after approval.
4. Run the now-bound SELECT-only verifier immediately afterward, before UAT writes.
5. Release application files only after Human Apply + verification PASS and explicit release instruction.

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_advisory_controlled_journey_087.sql
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/supabase/migrations/202610020087_advisory_controlled_journey.sql
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/verify_advisory_controlled_journey_087.sql
```

## Targeted validation

Disposable PostgreSQL 18 only, private Unix socket; no Production credentials. Coverage includes accepted contract, rollback of the entire migration, verifier pass/unbound failure, row/catalog/function/grant/policy/trigger drift rejection, Admin publish/default/snapshot version freeze, outcome validation, required reasons, conditional activation, new visits on loops, no unchosen-path skips, closing checks, FJ-1 compatibility, optimistic concurrency, exact retry replay, conflicting requests, inactive/password-required denial, and rollback when audit insertion fails.

Synthetic browser checks cover TH/EN × 390/768/1024/1440, Admin publication, Actual/Possible routes, modal close/inspection, required reason, duplicate submit, loop visit, create default selection, no horizontal overflow or console/runtime errors. These are local fixtures; no Production UAT was performed.

Pre-gate validation:

- 69/69 targeted FJ-2, FJ-1, Stage/workflow and skip-reason tests PASS, including PostgreSQL 18 real independent-session concurrency and rollback.
- Final candidate's verifier/contract/preservation check also PASS under C locale; the full 11-test PostgreSQL suite additionally passed under C during review.
- 8/8 TH/EN browser combinations PASS (390, 768, 1024, 1440); no overflow, page errors or console errors. Completion modal, duplicate submission, loop visits and map inspection/close verified.
- Touched-file ESLint, TypeScript, production build and diff/whitespace checks PASS.
- Offline artifact consistency PASS; verifier was intentionally unbound before Human baseline review.
- No PostgreSQL 17 binary is installed locally. PG17/18-safe NOT NULL normalization is retained and statically tested; actual database execution here used PG18.
- Screenshots and browser report: `/private/tmp/vp-fj2-review/`. Local-only evidence; no Production testing.


## Intended files (32)

- `app/admin/journey-templates/JourneyRoutingEditor.tsx`
- `app/admin/journey-templates/JourneyTemplates.tsx`
- `app/admin/journey-templates/journey-templates.module.css`
- `app/advisory/control/ControlledJourney.tsx`
- `app/advisory/control/JourneyOutcomeFields.tsx`
- `app/advisory/control/JourneyVariantField.tsx`
- `app/advisory/control/MatterDetail.tsx`
- `app/advisory/control/MatterJourney.tsx`
- `app/advisory/control/MatterSections.tsx`
- `app/advisory/control/MatterWorkflowDialog.tsx`
- `app/advisory/control/controlled-journey-labels.ts`
- `app/advisory/control/controlled-journey.module.css`
- `app/advisory/control/outcome-fields.module.css`
- `docs/core/ADVISORY_CONTROLLED_JOURNEY_087.md`
- `lib/advisory-control.ts`
- `lib/advisory-controlled-journey.ts`
- `lib/advisory-flexible-journey.ts`
- `lib/advisory-workflow.ts`
- `lib/i18n/messages/advisory-control.ts`
- `scripts/sql/advisory_controlled_journey_087_contract.sql`
- `scripts/sql/preflight_advisory_controlled_journey_087.sql`
- `scripts/sql/verify_advisory_controlled_journey_087.sql`
- `scripts/tests/advisory-controlled-journey-artifacts.cjs`
- `scripts/tests/advisory-controlled-journey-browser.cjs`
- `scripts/tests/advisory-controlled-journey-ui.test.cjs`
- `scripts/tests/advisory-controlled-journey.test.cjs`
- `scripts/tests/fixtures/advisory-087-footprint.json`
- `scripts/tests/fixtures/advisory-087-verifier-baseline.json`
- `scripts/tests/fixtures/advisory-controlled-journey-preview.js`
- `scripts/tests/fixtures/advisory-controlled-journey.json`
- `scripts/tests/non-litigation-preview.cjs`
- `supabase/migrations/202610020087_advisory_controlled_journey.sql`

No Finance, Case workflow or Client-centric implementation changed. Applied migrations 076–087 are unchanged. Unrelated pre-existing untracked files are retained byte-for-byte. No Production SQL or business data mutation by the release agent.

## Authorized release validation

- 88/88 targeted FJ-2, FJ-1, Stage/workflow and skip-reason tests PASS. Disposable PostgreSQL tests cover outcome/reason/target validation, single-outcome automatic selection, conditional activation, new loop visits, exact retries, concurrency, audit rollback, frozen snapshots and legacy preservation.
- TH/EN browser checks PASS at 390/768/1024/1440, including Admin publication, completion choices, required reason, double-submit protection, actual/possible paths, loop history, modal inspection/close and default variant selection. No horizontal overflow or console/runtime errors. Synthetic evidence: `/private/tmp/vp-fj087-release-review/`.
- Touched-file ESLint (21 files), TypeScript, production build, artifact consistency and whitespace checks PASS. Candidate SHA remains exact.
- Release uses the established push-to-main Vercel Git integration. The release response records the resulting commit and READY deployment evidence.

Human UAT: as Admin, configure outcomes/target stages/reason requirements in a new variant version. Use an authorized UAT Matter to check single-outcome automatic selection and multi-outcome required choice/reason. Confirm only the chosen conditional stage opens, looping creates a new visit, and Actual Path/Activity retain outcome, reason, actor and time. Publish a later version and confirm existing snapshots and historical FJ-1 Matters remain unchanged. Repeat relevant screens in TH/EN and on mobile. Stop after release for Human Production UAT; no automated Production business writes.
