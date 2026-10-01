# Flexible Journey FJ-1 / Migration 086 — Human Gate package

Status: Migration 086 Human-applied and SELECT-only verified PASS. Application release authorized; stop after release for Human Production UAT. Migration 086 is immutable.
Project: `/Users/paolawyer/vp-case-app/vp-case-web`, `main`.
Starting HEAD and origin/main: `13095e8cd88ad4e9fc20e4e4f9db34c3022bbc2f`.

Candidate: `supabase/migrations/202610010086_advisory_flexible_journey.sql`
SHA-256: `71d07c7b59f86f8cc007f40b434d4b09b4980a9e507da23c2d4db3dc7c2f0dc7`
Accepted 085 SHA-256: `db0870e52ecafaead843d30a3a5620091f7f5a1fdbfdd54a19330fac87bad0e7`.
All prior migration bytes are unchanged.

## Frozen FJ-1 architecture

Work Type still uses the accepted 18-type → 10-family mapping. A family has variants; each variant has immutable numbered versions. New Matters copy the selected version definition into their own immutable snapshot and ordered Stage plan in the original create transaction, then initialize the first Stage through the existing create path. No old Matter or Stage row is backfilled or rewritten.

Four tables: `advisory_journey_variants`, `advisory_journey_versions`, `advisory_journey_snapshots`, `advisory_journey_requests`. No columns added to existing tables. Two existing RPC definitions change: `advisory_control_write` (create/optional skip guards) and `advisory_control_read` (frozen names/snapshot). Their signatures/security/grants remain unchanged. Eight new functions include two authenticated RPCs (`advisory_journey_catalog`, `advisory_journey_manage`), an Admin predicate and private helpers. Four RLS policies and three immutability triggers protect new data. No direct DML grants to authenticated, anon or service_role; no service-role client in the new application API.

The candidate seeds one Standard variant/version per approved family, using the exact 085 sequences and TH/EN names. Contract & Business Documents has Optional `internal_review` and `delivery_negotiation` as shown in the approved mockup. Remaining initial stages are Required. Admin may publish further variants/versions; no unapproved extra variants are invented. Each family always retains one active default. The first Stage and terminal `close` marker are Required. A version has 2–20 unique, ordered stages and no branching/condition fields.

Admin management lives at `/admin/journey-templates`, within existing Settings navigation. Server page, session bridge, API and database management RPC require an active Admin with completed password onboarding. Non-Admin cannot manage via a direct URL/API/RPC. Existing Settings permissions are unchanged. Published definitions and Matter snapshots reject UPDATE/DELETE even by the owner; corrections are new versions.

Creation automatically selects the sole/default active variant. Radios appear only when multiple active variants exist. Selected version ID is sent explicitly, with optimistic validation if Admin publishes during selection. The backend can derive the default for an older app during the gated rollout. Lead checks remain unchanged. Family-scoped transaction locks serialize publication/default changes against snapshot creation. Request locks, actor/body matching, optimistic revision and existing Matter request ledger prevent duplicate writes.

Optional skip requires a nonblank reason (maximum 4,000 characters). Reason and actor are stored in the existing request/audit and Matter activity paths. Future optional stages with open tasks or a linked Next Action cannot be skipped. Skipping the current optional Stage uses existing task/Next Action checks, closes its visit with `exit_reason='skipped'`, records a skip marker and advances to the next non-skipped stage. It never completes a Task implicitly. Required stages cannot be skipped or manually jumped. After reopening with no current visit, an already visited Stage can be revisited using the existing Stage workflow. Existing Matters without snapshots retain their original semantics and histories.

Matter UI uses frozen stage names, order and Required/Optional flags, displays snapshot version/date and direct optional Skip actions. The existing interactive map remains available; long FJ plans use its vertical layout instead of shrinking labels. Lifecycle, Work State, tasks, time and closing checks remain separate. No Finance, Case workflow, Client-centric implementation, artwork or FJ-2 branching/rule engine changes.

## Human Gate order

1. Copy and run the SELECT-only Preflight. Review `gate_pass`, `failed_checks`, `object_differences`, row fingerprints, `rows_sha256` and `catalog_sha256`.
2. Bind those exact human-reviewed Production hashes into the verifier. The baseline fixture now contains the exact Human-reviewed Production hashes below; an unbound verifier still fails closed. Local disposable hashes are never stored as Production baseline pins.
3. Recheck candidate SHA, then Human Apply the transaction-wrapped candidate once.
4. Run the bound SELECT-only verifier immediately before new FJ business activity. It must prove exact new catalog, exact two changed RPCs, unchanged prior rows/catalog and only the approved 20 template seed rows. Snapshots and request tables must still be empty at this gate.
5. Human confirmed Applied + Verified PASS and authorized the FJ-1 application release. Do not reapply Migration 086 or use the immediate post-apply baseline after new legitimate FJ business activity.

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_advisory_flexible_journey_086.sql
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/supabase/migrations/202610010086_advisory_flexible_journey.sql
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/verify_advisory_flexible_journey_086.sql
```

Offline binding command (only after receiving reviewed hashes):
`node scripts/tests/advisory-flexible-journey-artifacts.cjs --bind-verifier ROWS_SHA CATALOG_SHA`
It verifies candidate bytes, changes only the verifier and baseline fixture, and never connects to a database.

Gates are static, self-contained SELECT statements with no business/helper RPC execution. Text aggregations use C collation. NOT NULL is read through `pg_attribute.attnotnull`, excluding PG18-only `pg_constraint` NOT NULL rows. New objects, policies, triggers, function definitions, owners, security, configuration and grants are fingerprinted. The old catalog excludes only incoming FKs owned by the four new, separately fingerprinted tables. No existing catalog difference is accepted implicitly.

## Validation

- 53 PostgreSQL tests: FJ-1 plus existing 077 workflow and 085 family regressions, on disposable PG18 only.
- FJ-1 separately passes both `en_US.UTF-8` and `C` locales. PG17 binary is not installed; PG17/18 NOT NULL normalization follows the established portable catalog contract.
- 56 UI/server/render tests: TH/EN, create Lead, single/multiple variants, required/optional actions, immutable snapshot labels, legacy compatibility, server/Admin denial and artifact consistency.
- Browser: TH/EN × 390/768/1024/1440; Admin publish, variant selection, inactive exclusion, required skip denial, reason validation, optional skip and map closure. No horizontal overflow, console/runtime errors or external network. Synthetic screenshots/report: `/private/tmp/vp-fj1-review/`.
- Real DB concurrency tests: identical requests create one snapshot/visit; identical publication retries are stable; different publication requests at one revision permit exactly one success. Rollback, stale selection, failed create, row/catalog/function/security/seed drift rejection, version/snapshot/request immutability covered.
- Touched-file ESLint, TypeScript, production build, artifact consistency and whitespace review.
- Existing tracked/untracked files compared with the initial SHA inventory; unrelated files and prior migrations preserved. No Production data changed, no commit/push/deploy.

## Authorized release validation

Human-confirmed Production Migration 086: Applied + Verified PASS. Bound baselines:

- `rows_sha256`: `dd2699a070017a00392a88ee99fafa5a2ec72eaf0c04bcdce0e91b56687e95db`
- `catalog_sha256`: `0d9fbb5a5e1c05da206abf934753a5318de35e8cd7ce1463216e4b28a0c70491`

Release rerun: 97 targeted FJ-1 / existing Journey workflow and family tests passed, including Admin/default management, frozen snapshots, required/optional skip guards, reason/audit, retries/concurrency and legacy preservation. Synthetic browser checks passed TH/EN at 390/768/1024/1440 with no overflow or console/runtime errors. Touched-file ESLint (32 files), TypeScript, production build and whitespace checks passed. Candidate/artifact consistency remains exact. The established release path is push to main followed by the Vercel Git integration; the release response records commit and READY deployment evidence.

Human UAT: open Settings → Journey templates as Admin; verify non-Admin denial. Check the family default and publish a new version only as an authorized UAT operation. Create an authorized Matter and confirm default/multiple-variant selection, required Lead, frozen version and first Stage. Confirm Required has no Skip, Optional requires a reason and records it in Activity, then compare an older Matter/history after publication. Repeat relevant screens in TH/EN and on mobile. No Production business writes are performed by the release agent.

## Intended files

- `app/admin/journey-templates/JourneyTemplates.tsx`
- `app/admin/journey-templates/access/page.tsx`
- `app/admin/journey-templates/client.ts`
- `app/admin/journey-templates/journey-templates.module.css`
- `app/admin/journey-templates/labels.ts`
- `app/admin/journey-templates/page.tsx`
- `app/advisory/control/Journey.tsx`
- `app/advisory/control/JourneySkipDialog.tsx`
- `app/advisory/control/JourneyVariantField.tsx`
- `app/advisory/control/MatterDetail.tsx`
- `app/advisory/control/MatterEditor.tsx`
- `app/advisory/control/MatterJourney.tsx`
- `app/advisory/control/MatterList.tsx`
- `app/advisory/control/MatterOverview.tsx`
- `app/advisory/control/MatterSections.tsx`
- `app/advisory/control/MatterTime.tsx`
- `app/advisory/control/MatterWorkflowDialog.tsx`
- `app/advisory/control/OtherClientMatters.tsx`
- `app/advisory/control/journey.module.css`
- `app/api/admin/journey-templates/route.ts`
- `app/components/AppTopNav.tsx`
- `docs/core/ADVISORY_FLEXIBLE_JOURNEY_FJ1_086.md`
- `lib/advisory-control.ts`
- `lib/advisory-flexible-journey.ts`
- `lib/i18n/core.ts`
- `lib/i18n/messages/advisory-control.ts`
- `lib/i18n/messages/common.ts`
- `lib/server/advisory-journey.ts`
- `scripts/sql/advisory_flexible_journey_086_contract.sql`
- `scripts/sql/preflight_advisory_flexible_journey_086.sql`
- `scripts/sql/verify_advisory_flexible_journey_086.sql`
- `scripts/tests/advisory-flexible-journey-artifacts.cjs`
- `scripts/tests/advisory-flexible-journey-browser.cjs`
- `scripts/tests/advisory-flexible-journey-ui.test.cjs`
- `scripts/tests/advisory-flexible-journey.test.cjs`
- `scripts/tests/fixtures/advisory-086-footprint.json`
- `scripts/tests/fixtures/advisory-086-seed.json`
- `scripts/tests/fixtures/advisory-086-verifier-baseline.json`
- `scripts/tests/fixtures/advisory-flexible-journey-preview.js`
- `scripts/tests/non-litigation-preview.cjs`
- `scripts/tests/non-litigation-ui.test.cjs`
- `supabase/migrations/202610010086_advisory_flexible_journey.sql`
