# Strategic Journey Map — 094 application release

Human reports Migration 094 applied and verified, with all eight approved
artworks usable. This release adds the existing approved artwork overlay inside
the Matter Journey modal. Artwork is presentation only; FJ snapshots, visits,
outcomes, transitions, audit and history remain the workflow source of truth.

## Immutable migration and reviewed baseline

- 094: `7dff992aeb2aaad3c26603ed47fda27b91406d801e1e290fbb57c6713f6fe93f`
- 083: `3682c449f708f600468f6cbd36d3b6de60fd7cc5850f6e9802f38b898481edfa`
- 084: `50cf5e40963a92d2a28772602852145b1bb183dc8b2958f24c6a34f0a16a9536`
- Reviewed rows: `0214720e18a354bae273316fa9b8e207676bcf2a9b3e447000477ebbae3faed2`
- Reviewed preservation: `78248328aad998844f7d17436a0568196bc785648ae05ac80dc521c22afcb1a5`

Do not reapply 094 during application release. The prior missing-function error
was reproduced locally by the old verifier's text-signature privilege check.
The verifier now checks via nullable OID and fails closed as JSON if the RPC is
absent. The candidate's CREATE → OWNER → REVOKE → GRANT ordering was already
correct. Whole-script apply and rollback were tested in disposable PostgreSQL.
The SELECT-only apply diagnostic remains evidence tooling, not a release step.

## Authorization and identity

`GET /api/advisory/journey-artwork?matter_id=<uuid>` authenticates the bearer
session and calls `advisory_control_read` with the caller's permissions. Only
after that returns the requested Matter does the server derive its frozen
Journey family, resolve the approved canonical key and call
`journey_artwork094_read` using the server-only service role. The RPC returns
only key, master path, width and height. The response contains a 180-second
signed URL with `Cache-Control: private, no-store` and `Vary: Authorization`.

The browser cannot supply artwork keys or arbitrary extra parameters. No direct
registry SELECT grants, Admin API access, RLS changes or Storage policy changes
are added by the application. Unavailable artwork uses the existing Journey UI.

| Frozen family | Canonical artwork key |
| --- | --- |
| universal / unknown | vp-img-7d8735910a68 |
| general_advisory / legal_analysis_compliance | vp-img-45be01527af4 |
| contract_business_documents / corporate_transactions | vp-img-12f92e9a6b60 |
| negotiation_pre_litigation | vp-img-4c8237b6ab72 |
| government_regulatory / administrative_challenge | vp-img-207f2702ed6c |
| employment_foreign_workforce | vp-img-af2748cfe7d9 |
| ip_registration | vp-img-379e81e18666 |
| real_estate_due_diligence | vp-img-8cb0b8b078e2 |

The authoritative coordinates are in `lib/advisory-journey-artwork-config.json`.
Anchors use top-left percentage coordinates and `translate(-50%, -50%)`.
Shorter journeys retain the ordered first anchors and final anchor. Journeys
beyond an artwork's capacity retain the existing non-artwork map; coordinates
are never synthesized. Images render at their intrinsic aspect ratio without
cropping. Connector curves do not change stage anchors.

Actual edges derive only from recorded visits; possible edges derive from frozen
FJ-2 outcomes. Re-entry remains visible in the per-stage visit history. Selecting
a stage or recorded visit updates details within the same modal. Existing
optional/skipped/current states remain distinct. At widths below 768px the
existing vertical Journey UI remains and no artwork request is made on initial
mobile load. The normal Matter page retains its compact summary and controls.

## Targeted validation

```sh
node scripts/tests/advisory-artwork-artifacts.cjs --check
env -u ARTWORK094_CAPTURE node --test scripts/tests/advisory-artwork.test.cjs scripts/tests/advisory-artwork-postgres.test.cjs scripts/tests/advisory-journey-presentation.test.cjs scripts/tests/advisory-controlled-journey-ui.test.cjs scripts/tests/advisory-flexible-journey-ui.test.cjs
node --test scripts/tests/visual-assets.test.cjs
node scripts/tests/advisory-artwork-preview.cjs
# Pass the localhost URL printed by the fixture server:
node scripts/tests/advisory-artwork-browser.cjs http://127.0.0.1:PORT
```

Release checks cover the eight artwork identities/all mapped families, Matter
authorization before privileged access, denied anonymous/unauthorized/arbitrary
asset requests, narrow RPC output, no direct registry access, 180-second signing,
no caching, actual/possible routes, loops, optional stages, same-modal details,
TH/EN, 1440px desktop, 820px tablet, 390px mobile, resizing, no overflow, and
missing/broken/expired artwork fallbacks. Browser fixtures use synthetic Matters
and a local stand-in image; final Production artwork appearance is Human UAT.
No Production rows or workflow RPCs are used for test mutation.

Touched-file ESLint, TypeScript, production build and whitespace checks complete
the release validation. Deployment uses the existing push-to-main Vercel Git
integration. The release response records its exact commit and deployment.

## Human visual UAT

1. Open an existing authorized Matter on desktop/tablet and open its Journey
   modal; verify the approved family artwork, uncropped image and aligned stages.
2. Switch Actual/Possible routes, select a stage and a repeated visit, and confirm
   details remain in one modal with correct current/optional/skip/history states.
3. Check TH/EN and 390px mobile: the existing vertical Journey remains usable;
   normal Matter controls and the compact summary stay in place.


## Release file scope

- `app/advisory/control/ControlledJourney.tsx`
- `app/advisory/control/Journey.tsx`
- `app/advisory/control/MatterJourney.tsx`
- `app/advisory/control/StrategicJourneyMap.tsx`
- `app/advisory/control/strategic-journey.module.css`
- `app/api/advisory/journey-artwork/route.ts`
- `lib/advisory-journey-artwork-config.json`
- `lib/advisory-journey-artwork.ts`
- `lib/server/advisory-artwork.ts`
- `lib/visual-assets.ts`
- `scripts/sql/preflight_advisory_journey_artwork_094.sql`
- `scripts/sql/verify_advisory_journey_artwork_094.sql`
- `scripts/sql/diagnose_advisory_journey_artwork_identity_094.sql`
- `scripts/sql/diagnose_advisory_journey_artwork_apply_094.sql`
- `scripts/tests/advisory-artwork-artifacts.cjs`
- `scripts/tests/advisory-artwork.test.cjs`
- `scripts/tests/advisory-artwork-postgres.test.cjs`
- `scripts/tests/advisory-artwork-browser.cjs`
- `scripts/tests/advisory-artwork-preview.cjs`
- `scripts/tests/fixtures/advisory-artwork-094-contract.json`
- `scripts/tests/fixtures/advisory-artwork-094-reviewed-baseline.json`
- `supabase/migrations/202610050094_advisory_journey_artwork_access.sql`
- `docs/core/ADVISORY_JOURNEY_ARTWORK_094.md`
