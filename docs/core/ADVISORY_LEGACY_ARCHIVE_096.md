# Fixed Legacy operational archive — 096 Human Gate

Status: LOCAL PREPARATION ONLY. No Production SQL, archival, commit, push or deployment performed. Migration 095 remains immutable. Existing unrelated tracked/untracked work is preserved.

## Scope and behavior

- Exactly ADV-2026-004..012 (nine real Legacy Matters). No generic archive feature or Admin UI.
- Add only `advisory096_capture()` (private) and `advisory096_archive_legacy(uuid,text,jsonb)` (active Admin required). Reuse `advisory_matter_archives`, its immutable marker trigger, parent/child write guards and operational views unchanged.
- The RPC has no arbitrary Matter selector. The number set is fixed; the exact UUID/number/fingerprint pairs must also match the Human-reviewed Preflight result. No UUIDs are guessed. The prior 095 preview did not supply these nine UUIDs.
- Insert nine archive markers atomically; do not update/delete existing Matter, lifecycle, Stage, snapshot, child, audit, request, Client, People, Finance, Case, asset, Storage or counter rows. No Journey/Stage backfill.
- Deterministic parent locks, preservation-scope SHARE locks, exclusive archive-marker lock, same-request replay checks. Any validation/permission/catalog/identity/row drift or transaction error aborts the entire batch. Timeouts: lock 5 seconds; statement 120 seconds.
- Real legacy Finance/Case references are disclosed and must be explicitly reviewed/bound. They are retained unchanged, not reassigned or removed. All pre-existing public rows, auth users and Storage metadata are fingerprinted; the eleven old archive receipts have a separate fingerprint.
- The exact installed 095 contract and accepted Advisory lifecycle/audit/snapshot foundation are verified. Normalization excludes only 095 additions which are independently pinned in full; it does not ignore original guards or permissions.

## Historical read path

`lib/advisory-legacy-archive.ts` now reads canonical `advisory_matters` with existing RLS/read permission and New-create Activity exclusion. Both listing and deep links exclude the exact eleven 095 UAT UUIDs independently of creation evidence. Children/history continue to use their existing canonical read-only readers. Existing TH/EN archive UI and mutation-free routes remain unchanged.

Operational readers remain on 095 views. A Legacy Matter can therefore disappear from operational lists/queues while remaining readable through `/advisory/records` and its historical detail routes.

## Verifier succession

095's old `protected_not_archived` and `no_other_archives=11` assertions describe only its original operation. They cannot be current assertions after the separately approved 096 operation.

The local 095 SELECT verifier now returns `gate_pass=false`, `failed_checks=["SUPERSEDED_BY_096_USE_CURRENT_VERIFIER"]`, and no old operational assertions once the 096 RPC exists. This is an explicit refusal to certify the new state, not a relaxed PASS. Before 096, its existing checks are unchanged. Migration 095, its Apply SQL, allowlist and reviewed baselines are untouched.

The new 096 verifier replaces that operation-specific gate: exact unchanged 095 object footprint; identical eleven prior receipts; exact nine new receipts; exactly twenty markers total; all original business/history rows and references unchanged; no operational parent/child leakage; exact new RPC bodies/permissions. Merely installing 096 without archiving cannot pass.

## Candidate

`supabase/migrations/202610070096_advisory_legacy_operational_archive.sql`

SHA-256: `9e3988018eebb7f4b5919ef6aa68daaf25e2e275ef4dbd73da1ff30e8f526f9b`

Accepted immutable 095 SHA-256:
`411182e4bed6f1ca2b4505aa765a1ef7aa0774f22f00e0769e5dffd72cec63c7`

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

Binding changes only the reviewed-baseline fixture and Human Apply/Post-Apply artifacts. Candidate bytes remain unchanged. The presently unbound Apply/Verifier fail closed.

4. After explicit Human approval, release the prepared application read-path patch before or alongside this archive operation. It is compatible with the existing 095 state. This avoids a temporary gap where the old application would hide archived Legacy history. Application commit/push/deploy is NOT authorized/executed in this preparation task.

5. Human copies and runs the ENTIRE bound Human Apply artifact. It installs 096 and archives the exact reviewed nine within ONE BEGIN/COMMIT. Do not apply the standalone candidate first, run a selected fragment, rerun 095, or perform manual marker inserts:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/apply_advisory_archive_096.sql
```

6. Human runs the SELECT-only 096 verifier immediately after Apply:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/verify_advisory_archive_096.sql
```

Require `gate_pass=true`, `failed_checks=[]`. Stop and inspect on any failure; never substitute hashes or disable guards. Normal live writes after Preflight can stale the preservation baseline; obtain/review a fresh Preflight instead of bypassing it.

7. Human UAT: 004..012 absent operationally; all nine readable in Legacy Data with original child/audit history and no edit actions; 013..023 absent from Legacy listing/deep links; Finance/Case references and existing operational workflows remain intact.

## Intended files

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
- Artifact consistency and SELECT-only static checks, touched-file ESLint, TypeScript, whitespace check.
- No production build/browser server needed: no visual/layout changes. Local test PostgreSQL instances stop in teardown. No background/dev process remains.
