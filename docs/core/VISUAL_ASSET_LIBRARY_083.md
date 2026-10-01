# Admin Visual Asset Library — Migration 083 and application release

Status: Migration 083 HUMAN-APPLIED and VERIFIED PASS in Production, as confirmed
by the user. The candidate is immutable. Application release is authorized;
the release response records the commit and Vercel deployment. No Production
SQL, artwork upload or business-data mutation is performed by the agent.

Repository: `/Users/paolawyer/vp-case-app/vp-case-web`, branch `main`.
Starting HEAD: `b3c606a30b0d821cb1d18f3088bc0d6713903d26`.

## Contract

- `visual_assets`: immutable `artwork_key`, TH/EN names, type, scope, theme,
  tags, Draft/Active/Retired, actual output dimensions/bytes/hash, two immutable
  object paths, Admin attribution and optimistic concurrency counter. Aspect
  ratio is derived from width/height; no artwork versioning system.
- `visual_asset_mappings`: unique `(scope, family_key)` → `artwork_key`.
  `both/universal` is the universal fallback. The pure resolver uses scoped family,
  shared family, then universal; only Active assets in the requested scope qualify.
  This release does not connect existing Advisory/Case renderers or Work Types.
  An empty library/missing fallback uses neutral UI; no artwork is seeded.
- Private `vp-visual-assets` bucket; 20 MiB original limit. JPG/PNG/WebP only.
  Originals use actor/operation UUID paths; optimized output uses another UUID.
  Original upload uses an Admin-guarded signed upload so a large image never
  passes through a Vercel request body. Originals are never gallery content.
- Server Sharp pipeline fully decodes and re-encodes, auto-orients, caps input
  at 40 MP, rejects animation/corruption/SVG/GIF, strips metadata, preserves alpha
  and aspect ratio, and never enlarges. WebP master max long edge 2560 px;
  thumbnail max long edge 512 px. Measured dimensions/bytes/hash are registered.
- Admin confirms the artwork contains no baked-in stage/status/date/user data.
  This is an explicit editorial attestation, not OCR or automatic text detection.
  Preview overlays 5/7/9 dynamic sample nodes without persisting Journey data.

## Authorization and integrity

Uses the existing `people_is_active_admin()`/`isActiveAdmin` role semantics, plus
the existing forced-password-change ceiling. No named users or new capabilities.
Every API request verifies `auth.getUser()` and the current profile before any
privileged Storage call. Registry reads use caller RLS; writes use one guarded
RPC. Non-Admin, inactive Admin and password-change-required sessions are denied.

Existing auth is browser-held. A dedicated `/admin/visual-assets/access` bridge
exchanges the verified session for a short-lived HttpOnly/Secure/SameSite scoped
cookie. `/admin/visual-assets` checks the current user/profile on the server
before rendering the library. Missing/expired sessions return to the bridge;
non-Admin sessions cannot render the protected page or use its API. No global
authentication or unrelated Settings permission is changed. The browser client
clears only this new cookie on sign-out/account switch, using a same-origin
cookie-clear endpoint that cannot grant access. Menu sits in the
existing Settings group and is visible only to active eligible Admin.

Storage has an Admin read policy plus bucket-scoped restrictive ceilings so
pre-existing broad policies cannot expose this bucket or allow direct raw writes.
The helper can be evaluated by anon for RLS without changing access to other
buckets; it returns false for anonymous callers. Only the guarded server uses the
existing service credential for signed-original upload and optimized output.
No service credential is sent to the client.

Mapped assets cannot retire/delete or change scope. Mapping changes use expected
old key; metadata uses expected version. Mutations serialize within this small
library. Delete first marks the unmapped asset Retired/pending cleanup, removes
objects through Storage API, then removes the registry row. Cleanup failure stays
visible/retryable, never produces an Active missing file. Unknown upload commit
results are read back before cleanup; referenced output is never deleted.
Interrupted uploads can leave private temporary originals; no general-purpose
garbage collector or automated Production cleanup is introduced in this gate.

## Completed Human migration gate

Preflight, Human Apply and the corrected Post-Apply Verifier have passed. Do not
re-run the migration. Bound reviewed Production fingerprints remain:

- rows: `08c5851fe53d31499cf53ccf64ded26cf33b4f945b5dee3e04da9f0ef09488b1`
- security: `27b35945b133182630a341593b8ebdbb2d4fda04cd616a02b5f808280a8faea1`

Production PostgreSQL 17.6 represents column NOT NULL through
`pg_attribute.attnotnull`; the local PostgreSQL 18 capture also includes named
NOT NULL entries in `pg_constraint`. The verifier normalizes only those redundant
validated/enforced entries. All column nullability flags remain compared, and
invalid/not-enforced constraints remain detectable. The raw accepted fixture,
Migration 083 and reviewed preservation hashes were not changed by this fix.

Preflight/Verifier inspect the exact new tables/columns/constraints/indexes/RLS/
ACL/functions/Storage policies/bucket. Preservation pins cover existing profile
rows, existing Storage records, existing Storage security/policies and the reused
Admin helper. They do not accept broader Finance/Case/Advisory drift. No business
RPC is executed by either gate; no local fixture substitutes for Production pins.
Migrations 076–082 stay byte-for-byte unchanged.

## Focused local validation

- Disposable PostgreSQL: 8 tests, including actual migration rollback, exact
  catalog, RLS personas, permissive-policy bypass attempts, mapping/retire/delete,
  optimistic conflict and fail-closed verifier drift simulations, plus PG18
  execution with a PG17 catalog projection and real nullability/constraint drift.
- Server/image/navigation: 7 tests, real Sharp decoding and dimensions,
  malformed upload rejection, API/page Admin gates, private cookie scope,
  upload/readback/retry and family/universal fallback.
- TypeScript, touched-file ESLint, production build and whitespace check.
- Local synthetic browser preview: TH/EN, gallery selection/search, upload form,
  actual shared modal, dynamic 5/7/9 overlays. No horizontal overflow at observed
  CSS widths 391, 768, 1024 and 1440; no captured runtime errors. Preview auth and
  network are isolated test doubles; these are not Production UAT results.

Release revalidation: 15/15 focused tests, artifact consistency, touched-file
ESLint, TypeScript and whitespace checks pass. The previously validated app
implementation remains unchanged; Vercel Git integration builds Production from
the pushed main commit. Existing Finance, Case, Advisory/Journey workflows,
unrelated Settings permissions and prior untracked files are preserved.

## Human Production UAT after deployment

1. Active Admin: open Settings → คลังภาพระบบ / Visual Asset Library; verify
   the library loads. Non-Admin: no menu, and `/admin/visual-assets` cannot render
   the library when entered directly.
2. Upload authorized JPG, PNG and WebP artwork; include an image over 2560 px.
   Verify actual dimensions/size, preserved aspect ratio, optimized WebP master
   and gallery thumbnail; a corrupt/non-image file must be rejected.
3. Search/filter, preview, edit metadata, change Draft/Active/Retired status and
   refresh to confirm persistence. Mapped artwork cannot be retired/deleted.
4. Open Safe Area Preview and select 5/7/9 stages. Confirm dynamic overlays,
   TH/EN labels and mobile layout; artwork itself is unchanged.

Stop for Human UAT. No automatic Production uploads or test records.

## Exact local file manifest

Modified existing files:

- `app/components/AppTopNav.tsx`
- `lib/i18n/core.ts`
- `lib/i18n/messages/common.ts`
- `lib/supabase.ts`

New files:

- `app/admin/visual-assets/VisualAssetLibrary.tsx`
- `app/admin/visual-assets/access/page.tsx`
- `app/admin/visual-assets/client.ts`
- `app/admin/visual-assets/labels.ts`
- `app/admin/visual-assets/page.tsx`
- `app/admin/visual-assets/visual-assets.module.css`
- `app/api/admin/visual-assets/route.ts`
- `docs/core/VISUAL_ASSET_LIBRARY_083.md`
- `lib/server/visual-assets.ts`
- `lib/server/visual-image.ts`
- `lib/visual-assets.ts`
- `scripts/sql/preflight_visual_asset_library_083.sql`
- `scripts/sql/diagnose_visual_asset_tables_083.sql`
- `scripts/sql/verify_visual_asset_library_083.sql`
- `scripts/tests/fixtures/visual-assets-083-contract.json`
- `scripts/tests/fixtures/visual-assets-083-reviewed-baseline.json`
- `scripts/tests/visual-assets-artifacts.cjs`
- `scripts/tests/visual-assets-postgres.test.cjs`
- `scripts/tests/visual-assets-preview.cjs`
- `scripts/tests/visual-assets.test.cjs`
- `supabase/migrations/202610010083_visual_asset_library.sql`

Candidate SHA-256: `3682c449f708f600468f6cbd36d3b6de60fd7cc5850f6e9802f38b898481edfa`.

Upload-token behavior was checked against the official [Supabase signed upload API](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl): upload uses a path-scoped token issued only after the server Admin check.
