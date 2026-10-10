# Case service 103 — Human-approved release

Project: `/Users/paolawyer/vp-case-app/vp-case-web`, `main`, base `11a1baa06b67bdccb2d39b1cb6233de3c2d1578b`.

Candidate: `supabase/migrations/202610100103_case_service_result_facts.sql`.
SHA-256: `273a7bda67b81d0c581ebbb5cd6c68757ade0ebb8fe9301aaaa4cccccece7133`.
Migration 102 remains `d88d3b513a9f574d7a03868e583fe0ead2a12056d95e6e621c853dde48df228e`.

## Reviewed change

Only `case_service_attempts` and the body of `case102_save(bigint,uuid,integer,uuid,text,jsonb)` change. Method/date become nullable with a result-dependent CHECK: served/pending require both; failed permits either to be unknown. Void retains the source facts, including unknown facts, and still requires a reason. Existing enum wire value `served` remains unchanged. Supplied invalid/future dates and unknown method codes are still rejected. Existing failed-reason requirements remain.

The result-first modal shows known outcomes first, makes failed method/date optional, and explicitly describes pending as an actual attempt. No fabricated dates/methods. Unknown historical facts display safely. Removing the lawful checkbox does not widen roles: for Lawyer/Partner/Admin, saving served facts with the displayed confirmation notice sends optional `confirm_lawful:true`, atomically recording both the attempt and lawful evidence. Assistant Lawyer may still record facts but cannot confirm lawful service. Old clients omitting this flag retain the existing explicit lawful action. Old delivered records are never retroactively confirmed. Existing lawful evidence cannot be overwritten by this flag.

+15/+30 remain suggestions only for served, confirmed facts. The existing separate deadline review/confirmation remains required. No deadline, task, Next Action, or flow transition is created by saving an attempt. All non-attempt action bodies, signatures, ACLs, RLS, audit, retry and concurrency guards remain unchanged. Void/correction history is preserved. No Finance, legacy Case, or 097–102 migration changes.

## Validation

- Targeted Node/UI/artifact/PostgreSQL: 30/30 pass (17 PostgreSQL cases, including existing 102 regressions).
- Existing populated 102 service records compare exactly before/after the new DDL.
- Failed facts independently optional; pending/served missing facts rejected; invalid facts rejected.
- Role parity, atomic confirmation, exact retry, stale/conflict, audit-failure rollback, before/after and reasoned void covered.
- Only the two intended catalog objects differ; other 097–102 dependencies unchanged.
- ESLint (changed application/tests), TypeScript, production build, diff check pass.
- Isolated local UI: TH/EN, desktop 1365px and 390px, failed save without method/date, pending completion to served, Viewer read-only, no overflow or console errors. Uses synthetic data; database mutation tests run only in disposable local PostgreSQL.
- Production SELECT-only preflight PASS, no object differences. Evidence: `docs/core/evidence/case-service-103-preflight.json`.
- All 59 pre-existing unrelated dirty paths preserved.

## Human Gate / next release order

Human approved candidate SHA above. Fresh Production preflight PASS with no object differences; the verifier is bound to this candidate and accepted contract `6fc5a0470eb4fb2ee4455a4470f536e0deb3b4694d22ffef1157a96accffbc2a`. Normal business row activity is not a gate input. Vercel auto-deploys on push, so commit locally, Apply and verify before pushing the application release. See the release evidence for final outcomes.

After approval: fresh SELECT-only preflight, bind the reviewed candidate/accepted-contract hashes in `scripts/tests/fixtures/case-service-103-reviewed.json`, regenerate only 103 artifacts, confirm the migration SHA unchanged, then Human Apply migration and run verifier before deploying the application.

Preflight clipboard command:
```sh
pbcopy < scripts/sql/preflight_case_service_103.sql
```
Human Apply clipboard command (only after approval):
```sh
pbcopy < supabase/migrations/202610100103_case_service_result_facts.sql
```
Post-Apply verifier clipboard command (after binding):
```sh
pbcopy < scripts/sql/verify_case_service_103.sql
```
Paste into the existing Supabase Production SQL Editor and execute the intended artifact. Migration is atomic BEGIN/COMMIT and uses a scoped schema/security drift guard. Never paste a migration into the SELECT-only preflight step.
