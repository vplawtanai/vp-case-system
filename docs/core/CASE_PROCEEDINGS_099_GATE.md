# Case Phase 2B — Hearing reports and procedural events

Prepared on 2026-10-08, branch `main`, base `98a26a4f0bba393bce13bcd533145d65e79c948f`. **Human Apply/release approved for the exact candidate SHA below. Fresh Production preflight passed before binding.**

Candidate: `supabase/migrations/202610080099_case_hearing_proceedings.sql`

SHA-256: `3756a06a439210310ea6efb84003d5de1d722abadccb4f9e15e72834c03103f1`

## Contract and preservation

- One additive table, `case_proceedings`, stores actual hearing reports or own motion / opponent motion / court order. A unique hearing reference permits one report per hearing. Existing hearings without reports remain unchanged.
- `case099_read(bigint)` reads records, author/editor names and existing follow-up references. `case099_save(bigint,uuid,integer,uuid,jsonb)` is the only API write path. Both use authenticated callers, fixed search path and 097 guards. No API direct writes or TRUNCATE on the new table.
- Existing process-writer roles (Admin, Partner, Lawyer, Assistant Lawyer) may save. Staff/Viewer may read according to existing Case read rules, but cannot save reports/events. Inactive/password-reset callers are denied. Audit visibility remains governed by the existing history permission.
- One save locks the Case then source hearing, validates versions/eligibility, creates the report/event, marks the original hearing Done, and creates only explicitly selected hearing/deadline/Next Action/Current Actor changes. Any failure rolls back everything. The same request and payload retry does not duplicate effects. A changed or stale request fails closed.
- Next Action reuses 098: link an existing active same-Case Task or record one manual action, without creating another Task. Current Actor handoff preserves other team roles. New assignments require active operational assignable internal People, no forced password reset, and non-Viewer operational roles. Call names display first; full names remain searchable.
- Deadline creation uses the entered confirmed date in the existing `case_deadlines` entity. It does not calculate legal dates, infer stages or derive Work State.
- Editing preserves record identity, creator, linked follow-ups and handoff evidence. Report/event old/new facts and each created/changed child are recorded in existing `case_audit_logs` with `auth.uid()`. Event type/date may be corrected; a report's original hearing identity is fixed. Edits do not silently replay follow-ups; those remain editable in existing sections.
- Migration Apply is additive DDL only. No legacy Case/history/Finance DML, backfill, task creation, counters or owner-name matching. Accepted 097/098 objects are pinned exactly, including function owners/ACLs/RLS/FKs. Migrations 001–098 are unchanged.

## Application

Existing Timeline is now “นัดและกระบวนพิจารณา / Hearings & proceedings”. Hearing reports stay attached to their original hearing; procedural events join the feed in reverse date order. Modals reuse `CaseEditModal` and Phase 2A form/People patterns. Optional follow-ups are progressively disclosed. Details include factual content, document link, author/editor timestamps and handoff evidence. No new page or procedural engine.

## Validation and Production evidence

- 39 targeted tests pass: 10 disposable PostgreSQL tests plus 29 artifact/render/model/Phase 1/Phase 2A tests. Existing Timeline mutation payload/audit fingerprints remain identical.
- Targeted ESLint, TypeScript, production build and `git diff --check`: pass.
- Local browser smoke uses the actual Case page/components with an isolated synthetic adapter, with transaction/security behavior separately verified against disposable PostgreSQL. TH/EN, 1440px/390px, report save/edit, optional follow-ups, existing Task link, People search, event save, cancel, Viewer read-only and no runtime/console error pass. No horizontal overflow; dialogs stay within the viewport.
- Final SELECT-only preflight ran in existing Chrome **VP (VP Partners)** → `vp-case-system` → `main PRODUCTION`. SQL Editor query `30523636-f153-4e80-b49b-f80cad013c6f`. Full result transcribed from the displayed result/cell into `evidence/case-proceedings-099-preflight.json`.
- `gate_pass=true`, `failed_checks=[]`, `object_differences=[]`. Accepted 098 object fingerprint `108395d606548a01b155954e364f679a74a8e2e626b5a0a5bb091d8075817af1`. 099 objects absent. No business RPC or Production mutation.
- Baseline fixture is bound to the Human-approved candidate and fresh accepted contract fingerprint above. Tests retain an explicit unbound fail-closed check. Normal live Case activity is not an Apply blocker; business row fingerprints are not preflight/verifier inputs.

## Human gate / safe order

1. Human review this candidate and Production preflight evidence. No Apply or application deployment before approval.
2. At approved Apply time, rerun `scripts/sql/preflight_case_proceedings_099.sql` in the existing Production SQL Editor. Stop on material schema/security drift.
3. Bind only the reviewed candidate/contract values in `scripts/tests/fixtures/case-proceedings-099-reviewed.json`, regenerate the verifier with `node scripts/tests/case-proceedings-099-artifacts.cjs`, and verify the candidate SHA stays identical. The artifact generator is preparation-only; after Apply the migration must be immutable.
4. Apply the entire approved candidate (BEGIN through COMMIT) once, then run `scripts/sql/verify_case_proceedings_099.sql`. Stop on any failure. The final release task is explicitly authorized to perform these steps.
5. Release intended application/artifacts only after the database gate passes. Do not create Production test hearings/reports to validate the release.

Background/dev processes: stopped. Only task-owned fixture/PostgreSQL processes were started and stopped; pre-existing/unknown processes were not stopped.
