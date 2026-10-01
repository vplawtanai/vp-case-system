# Visual Asset Library — simple upload prerequisite (084)

Status: Migration 084 HUMAN-APPLIED and VERIFIED PASS, confirmed by the user.
The candidate is immutable. Simplified application release authorized; the release
response records the commit and deployment. No Production SQL or uploads by the agent.

Project: `/Users/paolawyer/vp-case-app/vp-case-web`, `main`.
Release baseline: `362241a5e090fc490534fc0b0d361ece9bed54bb`.

## Confirmed blocker and smallest change

083 defines `overlay_ready boolean NOT NULL CHECK (overlay_ready)`. General
images cannot honestly satisfy that attestation by default. Automatically
passing true would misrepresent the image, so an application-only change is
insufficient.

084 removes only `visual_assets_overlay_ready_check` and sets the column's
default to false. NOT NULL remains. Existing values remain exactly as stored;
there is no UPDATE/backfill. True remains legal for artwork explicitly attested
as suitable for overlays. A narrow baseline guard requires the exact existing
boolean/NOT NULL/no-default/CHECK contract before the two DDL changes.

No RPC, authorization helper, ACL, RLS, Storage bucket/policy, file path,
existing key, mapping or image is changed. Active Admin remains the ceiling,
including inactive/forced-password-change denial. Migration 076–083 and all
Finance, Case, Advisory and unrelated Settings code remain unchanged.

## Simplified application release

- Normal upload asks only for a file. The server generates permanent code and
  localized system names. `artwork_key` is already unique and immutable through
  the write RPC: a lowercase key such as `vp-img-<random suffix>` can display as
  `VP-IMG-<same suffix>` and resolve by case-normalizing the exact stored key.
  Keep uniqueness enforcement; never use a signed URL as the identifier.
- Safe supplied metadata: illustration / both / draft, empty theme/tags,
  `overlay_ready=false`. "Both" is compatibility metadata; it does not create
  a Journey/Case mapping. Advanced metadata can remain optional.
- Gallery emphasizes image, permanent code and system name. Copy-code and
  copy-use-instruction actions use that stored reference.
- Keep the existing verified decoding/resize/WebP/thumbnail pipeline and
  Active Admin guards. Mapping stays optional and separate from upload.
- Upload now asks only for a file. The server derives a stable 12-hex suffix from
  its upload UUID, stores `vp-img-<suffix>` and displays `VP-IMG-<SUFFIX>`.
  Retrying the same upload returns the same record/code. Registry uniqueness
  rejects any collision rather than replacing an image. Existing keys are unchanged.
- Localized names are `ภาพ <CODE>` / `Image <CODE>`. Client-supplied upload
  metadata cannot override defaults or measured technical metadata.
- Copy actions return the exact code or `ใช้ภาพ <CODE> จากคลังภาพระบบ` (localized
  in EN). Search is case-insensitive, so the displayed code finds its actual row.
  No signed URL is copied as a reference. Existing named artwork remains compatible.
- Type/scope/status filters and optional mapping are in Advanced options. Metadata
  editing remains separate from upload. General images do not require an overlay
  attestation; existing true/false values remain unchanged during metadata edits.
- Gallery shows image, code, system name and copy actions. Preview keeps measured
  dimensions/bytes and the optional 5/7/9 sample overlay tool. The submit lock,
  pending-disabled controls, readback and upload retry protections remain.
- Active Admin server/API/RLS guards and image processing are unchanged. No
  Advisory/Case workflow, Finance or unrelated Settings changes.

## Completed Human migration workflow

1. Run SELECT-only Preflight. It compares the accepted portable 083 catalog and
   returns `rows_sha256` / `security_sha256`. Current legitimate uploads and
   mappings are included; no assumption of an empty library or reuse of old 083
   Production row hashes.
2. Bind exactly those reviewed Production values into the 084 verifier:
   `node scripts/tests/visual-assets-general-artifacts.cjs --bind ROWS_SHA SECURITY_SHA`.
   The initial verifier intentionally fails closed while those pins are absent.
3. Human Apply the immutable reviewed 084 candidate, then run the bound
   SELECT-only Post-Apply Verifier before any application release.

Preflight:

```bash
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_visual_assets_general_084.sql
```

Human Apply (after Preflight review/binding):

```bash
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/supabase/migrations/202610010084_visual_assets_general_library.sql
```

Post-Apply Verifier (after pins are bound):

```bash
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/verify_visual_assets_general_084.sql
```

Candidate SHA-256:
`50cf5e40963a92d2a28772602852145b1bb183dc8b2958f24c6a34f0a16a9536`

Accepted immutable 083 SHA-256:
`3682c449f708f600468f6cbd36d3b6de60fd7cc5850f6e9802f38b898481edfa`

## Targeted validation

Five disposable PostgreSQL tests cover: exact catalog delta and rollback;
preserved existing images/mappings/Storage rows/security; false vs NULL values
and immutable reference keys; Admin/non-Admin/RLS behavior; SELECT-only
verifier pass/fail with local in-memory test pins; real row/storage/schema/
permission drift; artifact consistency; PG18 execution with a PG17-shaped
catalog projection. Tests never bind fixture rows into Production artifacts.

Release validation: 15/15 targeted server/image/PostgreSQL tests pass, including
file-only JPG/PNG/WebP uploads, auto-generated immutable references, repeat finish,
safe defaults, invalid image rejection, existing keys, current Admin ceilings,
portable PG17/18 catalog and fail-closed preservation. Artifact consistency,
touched-file ESLint, TypeScript and whitespace checks pass.

Synthetic browser checks (no Production backend): file-only upload, disabled
pending controls, success/readback, code search, exact clipboard contents in TH/EN,
existing image reference compatibility, desktop and 390px without horizontal
overflow or console/runtime errors. Sharp tests exercise real image decoding;
browser upload/storage responses are isolated doubles, not Production UAT.

Reviewed Production pins:
- rows: `70d0444ac18e946f3ab5d7acadc39ed03be7749179481016402912c91b419b74`
- security: `27b35945b133182630a341593b8ebdbb2d4fda04cd616a02b5f808280a8faea1`

Human UAT after release:
1. Active Admin selects a JPG/PNG/WebP and uploads without filling metadata.
2. Check auto code/name, thumbnail and optimized dimensions/size; refresh and
   search using the copied uppercase code. The same image/code must remain.
3. Copy the code and the use-image instruction; verify TH/EN and mobile display.
4. Non-Admin must have no menu or direct page/API access. Mapping remains optional.

Stop for Human UAT. No automatic Production uploads or test records.
