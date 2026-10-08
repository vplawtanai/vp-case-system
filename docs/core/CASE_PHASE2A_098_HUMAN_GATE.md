# Case Phase 2A — approved contract and release evidence

Repository `/Users/paolawyer/vp-case-app/vp-case-web`, `main`; starting commit `0637f6d918382ef152ea275ceaacb83ea7d5a79a`.

## Approved additive contract

- `case_work_core`: optional Case row, optimistic version, independent work state, primary action absent/manual/existing Task link.
- `case_team_assignments`: People UUID roles Lead, Strategy, QC, Current Actor and members. One person may hold multiple roles. Lead and Current Actor remain distinct.
- `case098_read(bigint)` and `case098_save(bigint,integer,text,jsonb)` reuse existing active/password-ready permissions: Viewer reads; Staff may edit Next Action; Assistant Lawyer/Lawyer/Partner/Admin may also edit team/work state.
- New assignments require active operational assignable People. Existing assignments survive later account inactivity. No owner/name guessing or history backfill.
- Task linking uses the existing Task facts, locks/validates same-Case active Task and creates no duplicate Task. No Next Action and unassigned/no due date are supported.
- Direct API writes/TRUNCATE to new tables denied. RPC writes and authenticated-actor audit are atomic with version guard. Finance/Time and security 097 unchanged.

## Gate correction for active Production

Human explicitly approved removing stale whole-table business fingerprints as release blockers. Normal Case, Party, Timeline and Audit activity is not schema/security drift.

Preflight/verifier now check exact scoped 097 and new 098 table/function catalog, including constraints/FKs, RLS, policies, grants, owners, guards and function definitions; required People identity/permission columns and unique UUID identity are checked. The verifier binds candidate SHA and accepted existing contract SHA, not business row hashes. Normal legitimate writes to new 098 tables also do not fail the verifier.

Local tests attest that the approved Apply SQL does not execute legacy Case/history/Finance DML. The unchanged migration retains its own before/after preservation assertion **within one locked transaction**, which only checks changes caused during Apply; it does not compare against an old Production row baseline. Function bodies are installed during Apply, not executed. Their future authenticated audit writes are intentional.

- Candidate SHA: `c9cf604b4e92eeb2dde685a00816cfc5770e7d02ba45a58ff76b744fee81570c` (unchanged).
- Accepted 097 SHA: `bddd266cc305bf676b4fe4564181035dee25db830b367c279f6bb79729d57db6`.
- Bound accepted catalog SHA: `c7eaaf3ad577d025480d264c1a0880f7bdc5e994a500a5bbfd80c28426aa1d77`.
- Fresh SELECT-only Production preflight PASS, `failed_checks=[]`, `object_differences=[]`; evidence: `evidence/case-core-098-scoped-preflight.json`.
- Earlier business-row evidence in `evidence/case-core-098-preflight.json` is historical observation only, not an Apply condition.

## Safe release order

Push the DB/artifact-only commit first, preserving the current application in automatic Vercel builds. Apply the exact approved migration in the existing VP Supabase Production session, run the bound verifier, then release the prepared application commit only after PASS. Stop on verifier/smoke failure.

## Validation

Previously completed: 48 targeted tests, ESLint, TypeScript, production build, diff check; local TH/EN desktop/390px smoke including team, linked/manual/empty action and independent work state. No application changes since that validation.

Gate revision and binding: 15 targeted tests PASS, including disposable PostgreSQL role/security/atomicity and schema/FK/grant drift regressions. Verified ordinary Case/Party/Timeline/Audit/counter activity and legitimate 098 writes do not invalidate the gate. Bound/unbound/wrong SHA still fail appropriately. Changed test files pass ESLint; diff checks pass. Owned disposable PostgreSQL instances stopped.

No procedural engine, legal automation, Finance changes, Firestore or historical backfill. 59 unrelated pre-existing files remain outside release scope.

## Production receipt

Applied the complete approved SQL in `vp-case-system`, `main PRODUCTION`, existing VP authenticated Chrome session on 2026-10-08. SQL Editor receipt: `Success. No rows returned`.

- DB/artifact commit: `da498a5` pushed before Apply.
- Apply snippet: `16ccf751-8587-43c4-b8f9-d5bc95ea9ee1`; editor text round-trip matched the approved 21,219-character file before execution.
- Bound SELECT-only verifier snippet: `8944d058-bbe9-44c9-89c2-19be4d51f15d`.
- Verifier PASS: `gate_pass=true`, `failed_checks=[]`, `object_differences=[]`, all five checks true.
- Installed contract SHA: `108395d606548a01b155954e364f679a74a8e2e626b5a0a5bb091d8075817af1`.
- Evidence: `evidence/case-core-098-post-apply.json`.
- No Production business RPC/test data, legacy DML/backfill or Finance mutation executed by the release. Normal user activity is permitted independently.

Application release follows this successful verification. Production UI smoke is read-only (modal selection/cancel); real business saves are covered by the targeted local PostgreSQL/browser tests and reserved for authorized Human UAT.
