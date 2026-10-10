# Civil Defendant 104 — Candidate / Human Apply Gate

Status: **Human-approved, applied once and verified in Production.** The approved SQL is immutable. This migration-only task includes no UI or Phase 3C-3 application release.

Candidate: `supabase/migrations/202610100104_case_civil_defendant.sql`

```text
candidate_sha256 = 011cb7ed70adf1fb66d30c1af81bbfe20e5c1a18f2e3e2849393b21f450fb486
accepted_contract_sha256 = 5daa028767c1276d689fbcaad132c5a30e4f4ad51fb32af0f4b8e7146a2cec48
```

## Frozen amendments implemented

1. Active Answer Filing coverage is the source of truth. `case_service_controls.answer_filed_on` is only a compatibility projection: the earliest active covered Filing date, or null. Create/correct/void sync projection and affected Deadline state in the same transaction. Projection/integrity guards reject independent divergence. Individual Filing dates remain available on the Filing entities.
2. Filing correction/void never rewinds Flow automatically. If an active represented obligation reopens while at D-CIV-03, `case104_read` returns `flow_inconsistency=true` and a Human-confirmed RETURN suggestion to D-CIV-02. Transition and audit history remain intact.
3. Withdrawal updates representation membership only. It neither completes nor deletes/voids Filings, Deadlines, Extensions or history. Withdrawn Parties are excluded from active completion; re-add derives existing Filing facts and reuses the same control/Deadline identities.
4. No `case_defendant_events` table. Existing `case_service_events` already supplies immutable before/after, actor/time, unique request UUID, request payload and response receipt. Its nullable `party_id` supports a joint Case-level event. 104 uses `case104_*` action names and records exact affected Party IDs plus per-Deadline before/after effects. Existing `case_audit_logs` supplies the Case history surface. Neither existing table definition nor their guards change.

An active Counterclaim blocks dependent Filing void, replacement or coverage correction. The caller must explicitly void/correct/relink each affected Counterclaim, either first or in a validated compound RPC transaction. Metadata corrections that do not affect coverage/identity/relationship remain permitted. Deferred integrity checks are forced before the RPC acknowledges success. Original coverage revisions, replacement links and immutable receipts preserve the prior evidence.

## Exact object scope

The machine-readable catalog delta, including columns, constraints, indexes, ACLs, policies and triggers, is in `docs/core/evidence/case-defendant-104-object-diff.json`. Full expected catalog is `scripts/tests/fixtures/case-defendant-104-after.json`.

New tables (7):

| Table | Purpose |
| --- | --- |
| `case_defendant_representations` | Explicit Case/Defendant Party membership, active/withdrawn, version and actor/time |
| `case_answer_filings` | Filing identity, date, reference, active/void/corrected lifecycle, replacement and version |
| `case_answer_filing_parties` | Immutable coverage revisions: one Filing to 1..N Defendant Party IDs |
| `case_extension_groups` | Joint request/order identity and pending/granted state |
| `case_extension_group_parties` | Per-Party links to existing Deadline and existing child Extension |
| `case_counterclaims` | Minimal Counterclaim header, Filing link, lifecycle, replacement and version |
| `case_counterclaim_parties` | Immutable claimant Defendant / target Plaintiff coverage revisions |

Existing table changes (4):

| Table | Exact change |
| --- | --- |
| `case_flow_instances` | `filing_method` nullable only for Defendant template via `case104_filing_method_scope`; `case104_flow` trigger protects template identity and D-CIV-03 completion gate |
| `case_service_controls` | `case104_projection` before-write trigger and deferred `case104_integrity` trigger; no column or data rewrite |
| `case_deadlines` | `case104_deadline` trigger restricts direct API edits of 104-linked obligations to the controlled contract |
| `case_deadline_extensions` | `case104_extension` trigger restricts direct API edits of 104-linked extensions and prevents moving joint children to another Deadline |

New functions (12):

```text
case104_read(bigint)
case104_save(bigint,uuid,text,jsonb,jsonb)
case104_filed_date(bigint,uuid)
case104_all_resolved(bigint)
case104_flow_guard()
case104_counterclaim_write(bigint,text,jsonb)
case104_deadline_token(uuid,jsonb)
case104_sync(bigint,uuid[],jsonb)
case104_integrity()
case104_projection_guard()
case104_deadline_guard()
case104_parties(bigint,jsonb,text,boolean)
```

Only read/save are exposed to authenticated callers. Private helpers are revoked from PUBLIC/anon/authenticated/service_role. New tables enable RLS with the existing 097 session-ready and Case-read guards; authenticated receives SELECT only. API write/TRUNCATE grants are absent. Coverage rows also reject updates; all new tables reject hard delete/truncate.

One immutable configuration version is inserted into existing Core 101 catalogs, with exactly:

| Stage | Thai | English |
| --- | --- | --- |
| D-CIV-01 | รับหมายและประเมินกำหนด | Receive summons and assess deadlines |
| D-CIV-02 | จัดทำและยื่นคำให้การจำเลย | Prepare and file Defendant Answer |
| D-CIV-03 | รอนัดแรก | Await first hearing |

Catalogs are locked exclusively during installation; their exact immutable trigger definitions are restored inside the same BEGIN/COMMIT. Existing Plaintiff template/stages and all 097–103 function definitions, policies and grants remain unchanged. No business rows are inserted/updated/deleted by installation. No legacy Case, Finance, Filing, Service or Stage backfill.

## RPC contract and boundaries

`case104_read(case_id)` returns representation, Filing and Counterclaim identities with all coverage revisions, existing per-Party Service/Deadline/Extension facts, three-stage template/instance/transitions, immutable 104 receipts, scope version and derived completion/inconsistency/suggestion. Read permission matches existing Case visibility.

`case104_save(case_id, request_id, action, versions, data)` is one transaction and returns receipt/request IDs, next scope version, affected entity/Party IDs, Deadline effects and derived Flow signals. It locks the Case without updating it. Expected scope/entity/Flow/Core versions and current Deadline `updated_at`/due-date tokens prevent stale edits. The same actor/request/payload retry returns the original response; mismatched reuse fails.

| Actions | Permission / behavior |
| --- | --- |
| `representation` | Lawyer/Partner/Admin; explicit IDs and withdrawal reason; no inferred representation |
| `filing_create`, `filing_correct`, `filing_void` | Lawyer/Partner/Admin; joint effects and dependency checks atomic; correction/void reason required |
| `extension` | Lawyer/Partner/Admin; pending does not change due dates; Human-confirmed grants update the existing child extensions and each current due date atomically |
| `counterclaim_create/correct/void/relink` | Lawyer/Partner/Admin; same-Case active Filing, explicit claimant/target IDs, dependency integrity and reason guards |
| `flow_start` | Lawyer/Partner/Admin; explicit represented scope, acknowledged cut-in; no invented earlier stages |
| `flow_transition` | Assistant Lawyer/Lawyer/Partner/Admin; Human confirmation, version guard, reason for RETURN/SKIP/REPEAT/correction |
| `service` | Existing 102/103 fact tables; Assistant Lawyer or above; lawful confirmation remains Lawyer/Partner/Admin |
| `service_void`, `deadline` | Lawyer/Partner/Admin; explicit reason / Human-confirmed due date or existing Deadline link |
| `next` | Assistant Lawyer or above; delegates to Core 098, operational/assignable People only; creates no duplicate Task |

Staff/Viewer remain read-only; inactive and must-change-password users are denied. Future hearing outcomes, Counterclaim Answer workflow, legal date automation and UI are not included.

Important bounded cases:

- Case with an existing different Main Track is rejected rather than converted.
- An old unstructured `answer_filed_on` cannot silently become a Filing; first enrollment stops with `CASE104_LEGACY_FILING_REVIEW`.
- Completion requires a nonempty active representation and active Filing coverage for every Party. Extension alone never resolves an obligation.
- Withdrawal does not alter historical obligations. It does not imply completion of all obligations when no representation remains active.
- A last-Filing void reopens only a Deadline whose completion is proven to have been performed by this contract, with an unchanged token. Independent cancellation/change requires review.
- Joint extension coverage is fixed for that request/order identity. Correction updates its latest applicable core extension with audit; a later independent extension prevents stale correction. Dates are entered from facts, not inferred.

## Validation and Production preflight

Local PostgreSQL: **21/21 PASS**. Includes all seven required single/joint/three-Defendant scenarios, separate due dates, pending/granted extension, dependent Counterclaim block/correct/relink/void, D-CIV-03 reopening, withdrawal/re-add with Filing/Extension preservation, security/actor guards, retry/stale checks, atomic rollback on audit/second-Party failure, concurrent same-request filing, concurrent Counterclaim-versus-Filing void, and Plaintiff regression.

Artifact/static: **4/4 PASS**. ESLint: **PASS**. No app TypeScript/UI changes; no app build or dev server required. Exact results and process cleanup are in `docs/core/evidence/case-defendant-104-validation.json`.

Production: **PASS**, `gate_pass=true`, `failed_checks=[]`, `object_differences=[]`, 104 absent. Evidence: `docs/core/evidence/case-defendant-104-production-preflight.json`. Run through the existing Chrome VP session on `vp-case-system / main PRODUCTION`. SELECT only; no business RPC, auth-table read, mutation or row fingerprint.

Preflight examines scoped schema/security dependencies, immutable template seed, People column contract and absence of 104 conflicts. Normal Case/Party/Timeline/Audit activity is not a blocker. Candidate SHA and no-legacy-DML are local artifact attestations; the server cannot inspect the local SQL file.

## Verifier / completed Human Apply

`scripts/sql/verify_case_defendant_104.sql` is SELECT-only. It checks exact expected post-installation tables/functions (including ACL/RLS/FK/trigger definitions), unchanged dependencies, exact two-template seed and reviewed candidate/accepted-contract binding. It does not test by creating Production data. Mutation/security behavior is proven in the disposable PostgreSQL tests.

`scripts/tests/fixtures/case-defendant-104-reviewed.json` binds exactly the Human-approved candidate and accepted contract hashes above. Targeted PostgreSQL validation confirms the approved binding passes while null/other-candidate bindings and grants/RLS/security drift fail closed.

Human approval was received for this exact SHA. Final scoped preflight matched the approved result, then the complete migration ran once in Production and the bound verifier passed. Do not rerun Apply. The paths below identify the artifacts used:

```sh
# Preflight: copy into authenticated Production SQL Editor and run SELECT only.
pbcopy < scripts/sql/preflight_case_defendant_104.sql

# Applied once and verified. Do not rerun this migration.
pbcopy < supabase/migrations/202610100104_case_civil_defendant.sql

# Bound post-apply SELECT-only verifier.
pbcopy < scripts/sql/verify_case_defendant_104.sql
```

Project Guard baseline: main at `206254a9cb7ecca741da0ac8077cb9270da56c66`; 59 pre-existing dirty paths preserved byte-for-byte. Migration 097–103 SHA checks pass. Only 104 artifacts/tests/evidence/docs are authorized for commit/push. No manual application deployment is required. Task-owned disposable PostgreSQL stopped and status verified; no dev server opened.

## Production Apply evidence

- `docs/core/evidence/case-defendant-104-final-preflight.json`: fresh PASS, exact match to approved preflight, no partial 104 objects.
- `docs/core/evidence/case-defendant-104-apply-receipt.json`: one SQL Editor execution of the approved atomic script, Success / no rows returned. This is an installation receipt, not a business RPC receipt.
- `docs/core/evidence/case-defendant-104-production-verifier.json`: bound verifier PASS, all schema/security objects exact, no object differences.
- `docs/core/evidence/case-defendant-104-installation.json`: all 7 new tables empty, zero 104 business/audit receipts, zero Defendant instances/transitions; exactly one Defendant template/version and 3 stages.

No business RPC or test data was created in Production. Installation performs only the approved DDL and four immutable template/stage configuration inserts; it contains no Case/history/Finance data DML or backfill. Existing function/security definitions are exact. Normal concurrent business activity is not fingerprinted or asserted absent.
