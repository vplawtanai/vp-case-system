# Case Phase 2C — Continuation, rescue and close review

Prepared 2026-10-08 on `main`, base `4356f8aace7b6947ee437028f4850d8c685625c3`. **Human Apply/release approved for the exact candidate SHA below. Fresh Production preflight passed before binding.**

Candidate: `supabase/migrations/202610080100_case_engagement_review.sql`

SHA-256: `5680dee06e16a668cbb55784c69055c7f7c8447a30ed5d003be0474d58dda0f1`

## Small additive contract

- `case_continuation_decisions`: explicit waiting / continue / end decisions, appended in Case-local sequence. Waiting has no invented confirmation date; continue/end require an actual confirmation date. A later decision preserves prior facts and reviews. This does not change legal Case status or start another procedural stage.
- `case_rescue_requests`: actual exceptional help request, eligible recipient, subject/reason, occurrence time, open/resolved status and resolution. Requester, recorder/editor, resolution actor and timestamps come from the authenticated transaction. Routine Strategy/QC assignment is not a rescue. Correction, resolution and reopening retain before/after audit.
- `case_close_reviews`: one review per ended-scope decision, objective achieved / partial / not achieved / not applicable, actual scope-ended date, optional variance/lessons/knowledge/HTTPS document reference. Creation snapshots existing 098 team IDs/roles/display names **at review recording**, not guessed historical ownership. Time, Case identity and rescue count remain available through existing references; users do not re-enter them. Old reviews stay readable after a new continuation decision. Only the current ended-scope review is editable.
- `case100_read(bigint)` and `case100_save(bigint,text,uuid,integer,uuid,uuid,jsonb)` reuse 097 guards and existing Case/People identity. Save serializes on the Case, validates versions/current decision and explicit request identity, then writes the new record and existing audit log in one transaction. Any failure rolls back both. Exact retries do not duplicate records or audit; stale/conflicting input is rejected.
- Admin / Partner / Lawyer / Assistant Lawyer use the existing process-write permission. Staff / Viewer read only under existing Case read rules. Inactive or password-reset callers are denied. New recipient assignments require active operational assignable internal non-Viewer People with no forced password reset. Existing historical recipients remain readable and can be retained after eligibility changes.
- New tables have RLS and authenticated SELECT only; no direct API writes/TRUNCATE. RPCs are SECURITY DEFINER with fixed `pg_catalog,public` search path, postgres ownership and authenticated-only execution. No anon/service-role grants. Existing audit-history visibility is unchanged.

## Application and preservation

A compact strip below the existing Team / Next Action area opens the continuation and rescue modals. The close-review prompt appears only when the current VP scope is ended. History is available in the same modal pattern; no new page, procedural stepper, manual Work State, dashboard or approval workflow.

All modals reuse `CaseEditModal`, Phase 2A People search/call names, and shared language/layout patterns. Continuation uses the supplied mockup's compact radio/date/note hierarchy; its example judgment and Case facts are not fabricated. Optional review knowledge fields use disclosure. Existing Case sections, Team/Next Action, hearing/proceeding and Finance links retain their behavior.

Apply is additive DDL only: no legacy Case/history/Finance DML, owner matching, backfill, counters or historical rows touched. Migrations 001–099 remain unchanged. Existing 097–099 catalog objects are pinned, including owners, grants, RLS, triggers, indexes and FKs. Normal Case activity is not an Apply blocker; neither business-row nor auth-table fingerprints are gate inputs.

## Validation and evidence

- 44 focused tests pass: 10 disposable PostgreSQL transaction/security/artifact tests plus 34 model/render/Phase 1/098/099 regressions. Covers role parity, People eligibility, append history, stale/cross-Case/spoofed input, same-request retry, close-review context, audit rollback and legacy preservation. Deliberate FK/RLS/grant/098/099 drift fails verification.
- Targeted ESLint, TypeScript, production build and whitespace checks pass.
- Local browser uses actual Case components with isolated synthetic data; PostgreSQL tests independently verify real transaction behavior. TH/EN, desktop 1440px / mobile 390px, continuation / rescue / close-review open/save/cancel, history, resolution, optional disclosure, People surname search and Viewer read-only checked. No overflow or runtime/console errors. No Production business RPC or test data.
- SELECT-only Production preflight ran in existing Chrome **VP (VP Partners)** → `vp-case-system` → `main PRODUCTION`, SQL Editor query `30523636-f153-4e80-b49b-f80cad013c6f`. Displayed result and full cell transcribed into `evidence/case-engagement-100-preflight.json`.
- `gate_pass=true`, `failed_checks=[]`, `object_differences=[]`; 100 objects absent; People contract and accepted 097–099 objects match. Accepted contract fingerprint: `df1eaeced54b4e2909dcc621951c45df3fb4ab15b95cfcb2a772da28c059ce21`.
- Reviewed fixture is bound to the Human-approved candidate and fresh accepted contract fingerprint above. Tests retain an explicit unbound fail-closed check.

## Human gate and safe order

1. Review the additive semantics, permissions and exact candidate SHA above.
2. After approval, rerun `scripts/sql/preflight_case_engagement_100.sql` in the same Production SQL Editor. Stop on material schema/security drift.
3. Bind only the approved candidate and accepted contract values in `scripts/tests/fixtures/case-engagement-100-reviewed.json`; run `node scripts/tests/case-engagement-100-artifacts.cjs` and confirm candidate SHA remains identical. Do not regenerate an applied migration.
4. Apply the entire approved candidate, `BEGIN` through `COMMIT`, once. Then run `scripts/sql/verify_case_engagement_100.sql`; require `gate_pass=true` and no object differences. Stop on failure.
5. Release intended application/artifacts only after the database gate passes. Do not create persistent Production test decisions/rescues/reviews for smoke testing. The current release is explicitly Human-approved.

Background/dev processes: stopped. Task-owned preview and disposable PostgreSQL processes are stopped; no pre-existing or unknown process is stopped.
