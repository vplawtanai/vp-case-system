# Fixed Legacy operational archive — 096 Human Gate

Status: HUMAN-APPROVED CANDIDATE; fresh Production SELECT-only Preflight PASS on 2026-10-07. Exact nine identities, child/history fingerprints and per-Matter Finance references match the previous Human review. Apply is authorized and pending at this commit. The Legacy read-path patch is already released; this revision changes only 096 artifacts/tests/documentation. Migration 095 remains immutable; unrelated work is preserved.

## Scope and behavior

- Exactly ADV-2026-004..012 (nine real Legacy Matters). No generic archive feature or Admin UI.
- Add only `advisory096_capture()` (private) and `advisory096_archive_legacy(uuid,text,jsonb)` (active Admin required). Reuse `advisory_matter_archives`, its immutable marker trigger, parent/child write guards and operational views unchanged.
- The RPC has no arbitrary Matter selector. The number set is fixed; the exact UUID/number/fingerprint pairs must also match the Human-reviewed Preflight result. No UUIDs are guessed. The reviewed Production preview identifies the nine UUIDs; a fresh Preflight for this revised candidate must confirm them before binding.
- Insert nine archive markers atomically; do not update/delete existing Matter, lifecycle, Stage, snapshot, child, audit, request, Client, People, Finance, Case, asset, Storage or counter rows. No Journey/Stage backfill.
- Deterministic parent locks, SHARE locks on related history tables and Finance tables with matching references, an applying-Admin row lock, exclusive archive-marker lock, and same-request replay checks. Any validation/permission/catalog/identity/row drift or transaction error aborts the entire batch. Timeouts: lock 5 seconds; statement 120 seconds.
- Real legacy Finance references are preserved and fingerprinted only where they match target Matter numbers/UUIDs or related child identifiers. Each matching table returns a count and row hash. No Finance row is changed. Unrelated Finance/Case/Client/People/Storage rows and all `auth.users` data are outside the preservation fingerprint. The eleven old archive receipts retain their separate fingerprint.
- Reuse/pin the existing 095 marker, immutable marker/write guards, operational views and read helpers. Keep the accepted Admin check and snapshot/request immutability checks. Remove the inherited whole-database catalog/role and unrelated Journey-template checks. The immutable 095 SQL and its old capture function are not edited or executed.
- `rows_sha256` now covers per-Matter counts/hashes for the nine original Matters and related child/history rows (including request/audit evidence and linked office work logs), plus matching Finance rows. `preserved_sha256` covers only the reused archive/read and Admin/history guard contracts. No auth credentials or auth metadata are read.
- Auth timestamp changes and unrelated business activity cannot stale this baseline. Target/history/reference drift still fails closed; permission changes still deny the applying Admin. This is the approved narrower operation scope, not a normalization of auth credentials or acceptance of an unexplained auth change.

## Historical read path

`lib/advisory-legacy-archive.ts` now reads canonical `advisory_matters` with existing RLS/read permission and New-create Activity exclusion. Both listing and deep links exclude the exact eleven 095 UAT UUIDs independently of creation evidence. Children/history continue to use their existing canonical read-only readers. Existing TH/EN archive UI and mutation-free routes remain unchanged.

Operational readers remain on 095 views. A Legacy Matter can therefore disappear from operational lists/queues while remaining readable through `/advisory/records` and its historical detail routes.

## Verifier succession

095's old `protected_not_archived` and `no_other_archives=11` assertions describe only its original operation. They cannot be current assertions after the separately approved 096 operation.

The released 095 SELECT verifier returns `gate_pass=false`, `failed_checks=["SUPERSEDED_BY_096_USE_CURRENT_VERIFIER"]`, and no old operational assertions once the 096 RPC exists. This is an explicit refusal to certify the new state, not a relaxed PASS. Before 096, its existing checks are unchanged. Migration 095, its Apply SQL, allowlist and reviewed baselines are untouched.

The new 096 verifier replaces that operation-specific gate: exact unchanged reused 095 archive/read footprint; identical eleven prior receipts; exact nine new receipts; exactly twenty markers total; all nine original Matters, related history and linked Finance rows unchanged; no operational parent/child leakage; exact new RPC bodies/permissions. Merely installing 096 without archiving cannot pass.

## Candidate

`supabase/migrations/202610070096_advisory_legacy_operational_archive.sql`

SHA-256: `f5bc981d03da99cde617b7a406f46b4b17eadafc16232a008671a4003ffdbf87`

Accepted immutable 095 SHA-256:
`411182e4bed6f1ca2b4505aa765a1ef7aa0774f22f00e0769e5dffd72cec63c7`

The SHA changed because 096 capture/locks and its embedded expected contract were narrowed. Prior whole-database `rows_sha256`/`preserved_sha256` values cannot be reused. The reviewed-baseline fixture now binds the fresh scoped Production result and the previously approved Admin.

- Admin: `52b8fea2-2558-4b76-a92b-2d332c0fee8e`
- Fresh request: `090e8ada-2cbf-430f-84ed-c0e0a863a8d2`
- Rows: `e80b0e76ad1d4ea82da3655a3e58be1382586e5ca48fb163a4a86caf4b00527f`
- Preserved contract: `4bfb020aa654a727211ad08498978ce1afdea7375313fb97f93cdfb83f57261a`
- Targets: `bb249e154d9071ba46b9d18f35c99c7db6d6d9eb31f9d4811e43d524c5e4da20`
- Prior receipts: `5d48b6024fcb128927e91f47660c856e74d2c800cecb797c1117de02336e6217`

## Next Human Gate — do not skip binding

1. Human runs this SELECT-only Preflight in Production SQL Editor as postgres:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_advisory_archive_096.sql
```

2. Require `gate_pass=true`, empty failures, the candidate SHA above, exact nine UUID/number pairs, reviewed reference evidence and the eligible active Admin list. Save the complete JSON result locally. Human explicitly approves those identities, all four hashes (`rows_sha256`, `preserved_sha256`, `targets_sha256`, `prior_archives_sha256`), references and ONE Admin UUID. Generate/approve a fresh request UUID for this operation; do not reuse 095's request.

3. Bind only after that review (arguments below are placeholders, not inferred values):

```sh
cd /Users/paolawyer/vp-case-app/vp-case-web
node scripts/tests/advisory-legacy-archive-096-artifacts.cjs --bind /absolute/path/to/human-reviewed-preflight-096.json REVIEWED_ADMIN_UUID FRESH_REQUEST_UUID
node scripts/tests/advisory-legacy-archive-096-artifacts.cjs --check
```

Binding changes only the reviewed-baseline fixture and Human Apply/Post-Apply artifacts. Candidate bytes remain unchanged. The bound Apply/Verifier fail closed on stale scoped evidence or mismatched identity.

4. The released Legacy read path already reads the canonical historical tables. No additional application feature or deployment is needed for this scope revision.

5. Human copies and runs the ENTIRE bound Human Apply artifact. It installs 096 and archives the exact reviewed nine within ONE BEGIN/COMMIT. Do not apply the standalone candidate first, run a selected fragment, rerun 095, or perform manual marker inserts:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/apply_advisory_archive_096.sql
```

6. Human runs the SELECT-only 096 verifier immediately after Apply:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/verify_advisory_archive_096.sql
```

Require `gate_pass=true`, `failed_checks=[]`. Stop and inspect on any failure; never substitute hashes or disable guards. Changes to the nine targets, their history or linked Finance rows after Preflight can stale the scoped preservation baseline; obtain/review a fresh Preflight instead of bypassing it.

7. Human UAT: 004..012 absent operationally; all nine readable in Legacy Data with original child/audit history and no edit actions; 013..023 absent from Legacy listing/deep links; Finance/Case references and existing operational workflows remain intact.

## Original archive/read-path release files

Application/read tests:
- `lib/advisory-legacy-archive.ts`
- `scripts/tests/advisory-legacy-archive.test.cjs`
- `scripts/tests/fixtures/advisory-legacy-archive-preview.js`
- `scripts/tests/advisory-archive.test.cjs`

Verifier succession only:
- `scripts/tests/advisory-archive-artifacts.cjs`
- `scripts/sql/verify_advisory_archive_095.sql`

096 preparation:
- `supabase/migrations/202610070096_advisory_legacy_operational_archive.sql`
- `scripts/sql/advisory_archive_096_contract.sql`
- `scripts/sql/preflight_advisory_archive_096.sql`
- `scripts/sql/apply_advisory_archive_096.sql`
- `scripts/sql/verify_advisory_archive_096.sql`
- `scripts/tests/advisory-legacy-archive-096-artifacts.cjs`
- `scripts/tests/advisory-legacy-archive-096.test.cjs`
- `scripts/tests/advisory-legacy-archive-096-postgres.test.cjs`
- `scripts/tests/fixtures/advisory-096-contract.json`
- `scripts/tests/fixtures/advisory-096-reviewed-baseline.json`
- this document

## Targeted local validation

- 096 PostgreSQL tests: exact candidate and bound Apply in disposable PostgreSQL 18, rollback of full install/archive, unauthorized actors, changed/missing reviewed targets, reference changes, stale data, concurrent identical retries, preserved 095 receipts/history, operational exclusion, base-history access and contract/security drift rejection.
- Existing 095 PostgreSQL regression tests unchanged.
- Legacy read/component tests: TH/EN, archived records remain readable, children/deleted history retained, permission failure closes access, UAT IDs excluded from listing and direct links, no mutation controls.
- Added focused regressions: auth/shared/unrelated Finance updates do not block; target/history/request/audit/linked Finance drift does block; applying-Admin eligibility remains enforced. Artifact consistency and SELECT-only checks, touched-file ESLint and whitespace checks. No application/TypeScript source changed in this revision.
- No production build/browser server needed: no visual/layout changes. Local test PostgreSQL instances stop in teardown. No background/dev process remains.
