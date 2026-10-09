# Case Phase 3A — Civil Flow Foundation / Human Gate

Prepared on `main`, base `d20d68d0d0858544b55de9346f838d0f2fffebd7`. **Human-approved candidate APPLIED and VERIFIED in Production. Candidate is now immutable.**

Candidate: `supabase/migrations/202610090101_case_civil_flow_foundation.sql`

SHA-256: `7e88a49065a7ebbd0c50c9514ec5608869291a7464218921233c2970a21d311c`

## Contract

- Four new tables: `case_flow_versions`, `case_flow_stages`, `case_flow_instances`, `case_flow_transitions`. The immutable template/version owns family, variant and represented role. Instance profile records the chosen filing method as metadata; no e-Filing integration.
- One immutable Civil Ordinary Plaintiff v1 configuration, with the 12 approved stages. Configuration seed is the only Apply INSERT. No Case is enrolled automatically.
- Instance identity is separate from Case identity, with `track_key` and unique `(case_id, track_key)`. Only Main Track can be started by the Phase 3A RPC. Future separate tracks do not require replacing a single current-stage field on `cases`.
- `case101_read(bigint)` and `case101_save(bigint,uuid,integer,uuid,text,jsonb)`. Save locks the Case, checks instance identity/version and immutable request receipt, derives the real actor/time, then writes instance + event + Case audit atomically. Failed audit or validation rolls back all writes. A retry of any accepted request returns current state without duplicating history; changed payload/actor conflicts.
- Manual stage selection derives NEXT / REPEAT / SKIP / RETURN. Pause/resume/exit are explicit manual actions with reasons. BRANCH / PARALLEL are reserved semantic values in the history contract; this single linear pilot does not start branches or parallel tracks. There is no procedural automation, legal deadline calculation or manual Work State.
- Correct latest stage record appends a reasoned correction linked to the latest event, never edits/deletes it. It restores the previous lifecycle and uses the explicitly selected actual stage. The original start-stage fact remains preserved. Later corrections append another reasoned event; the entire correction chain stays visible.
- Immutable configuration/history rejects UPDATE/DELETE/TRUNCATE, including owner-issued accidental writes. API roles have authenticated SELECT only, no direct writes/TRUNCATE. RPCs have fixed search path, postgres ownership and authenticated execution only. No anon/service-role execution.

## Cut-in and UX

- `/cases/[id]` gets one compact procedure card and the existing Case/Finance modal pattern. No changes to `/cases` or existing detail sections.
- Start modal: pilot variant, represented role, filing method, actual current stage and explicit acknowledgement. No invented past dates. Existing Cases start using `cut_in`; the contract also permits a new flow at its first stage.
- Cut-in creates one starting event, no prior visits. The full template remains visible; stages without evidence say there is no record, never completed. Current stage is emphasized. Superseded events remain visible in history but do not count as current evidence.
- TH/EN use the existing shared language provider and Case label catalog. Stage names come from the pinned template. No technical transition-code dropdown. Editing uses the same modal, not a nested dialog.
- Starting: Lawyer / Partner / Admin. Transitions: Assistant Lawyer / Lawyer / Partner / Admin. Staff / Viewer read-only. All server reads/writes reuse 097 session-ready and Case permission guards, including inactive/password-reset denial.

## Preservation and gates

- Existing 097–100 tables/functions, including RLS, grants, owners, FKs, indexes and triggers, are pinned by the accepted contract artifacts. People identity/guard-column and unique-ID prerequisites are checked.
- No legacy Case/history/Finance DML, owner-name matching, Stage backfill, account changes or counter updates. Shared Core 098, Proceedings 099, Engagement 100 and security 097 are unchanged.
- Preflight/verifier use schema/security/configuration evidence only. Normal new Case/Party/Timeline/Audit activity is not a blocker. No business-table or auth-table row fingerprint.
- Reviewed fixture stays unbound (`null` candidate/accepted-contract hashes). The post-Apply verifier deliberately fails closed until Human-reviewed binding after preflight. Do not run it as a replacement for preflight.

## Validation checkpoint

- PASS: 8 disposable PostgreSQL tests covering installation/preservation, six-role parity, cut-in, transitions/reasons, immutable history/correction, retry/stale/cross-instance input, audit rollback, and deliberate FK/grant/RLS/function drift.
- PASS: 5 model/render/artifact tests covering accepted migration hashes, exact configuration, no legacy DML, no fake completion, role UI parity, shared-modal rendering and TH/EN errors. The initial artifact-test filename typo was corrected and only that test was rerun.
- PASS: targeted ESLint, TypeScript, production build, `git diff --check`.
- PASS: local isolated actual-component browser smoke, TH desktop and 390px, EN 390px, start/select/acknowledge/save, next-stage save, cancel, Viewer read-only, all 12 stages, no horizontal overflow or runtime errors. Synthetic in-memory UI data only; real transaction behavior tested separately in disposable PostgreSQL.
- PASS: final-candidate SELECT-only Production preflight in existing Chrome VP (VP Partners), project `vp-case-system`, `main PRODUCTION`, SQL Editor query `e6c5d7cb-3481-4122-9826-5f530213c16c`. `gate_pass=true`, `failed_checks=[]`, `object_differences=[]`. Full observed result transcribed into `evidence/case-flow-101-preflight.json`. Accepted scoped contract SHA: `293f17785803862554022b9bed6191c1d300be035b1dcf066e67520fe80425a3`. No business RPC or mutation.
- Final review removed an unnecessary restriction on correcting a correction. PostgreSQL correction-chain coverage, candidate/artifact tests, changed-file lint and production build were rerun for the final SHA above; all passed. No unrelated suites were rerun.

## Human steps — do not execute Apply before approval

Preflight (copy into existing Production SQL Editor and run the complete SELECT):

```sh
pbcopy < scripts/sql/preflight_case_flow_101.sql
```

Human review and fresh Production preflight confirmed the exact candidate and `accepted_contract_sha256`; `scripts/tests/fixtures/case-flow-101-reviewed.json` and the SELECT-only verifier are bound. Candidate SQL is unchanged. Approved Apply:

```sh
shasum -a 256 supabase/migrations/202610090101_case_civil_flow_foundation.sql
pbcopy < supabase/migrations/202610090101_case_civil_flow_foundation.sql
```

Apply the whole `BEGIN` through `COMMIT`, then run the bound SELECT-only verifier:

```sh
pbcopy < scripts/sql/verify_case_flow_101.sql
```

Require `gate_pass=true` before any application release. Stop on material contract drift. The approved release task applies this exact candidate, verifies, then releases the application. Git push is deferred until verification because main auto-deploys to Production.

Background/dev processes: stopped. Only this task's isolated preview and disposable PostgreSQL were started and stopped; pre-existing processes were not stopped.

## Production Apply receipt

- Existing authenticated VP Chrome session; `vp-case-system` / `main PRODUCTION`.
- Fresh scoped preflight PASS, no object drift, before Apply.
- Apply query `46c7421b-4fd1-4382-9a1b-3e80838d882a`: complete approved BEGIN/COMMIT script; UI returned `Success. No rows returned`.
- Bound SELECT-only verifier query `2f6c3ecd-2af6-4038-9470-2ba36295ef0b`: `gate_pass=true`, `failed_checks=[]`, `object_differences=[]`, exact template seed and People contract. Full observed result: `evidence/case-flow-101-post-apply.json`.
- Only immutable configuration was seeded. No Case enrollment or business RPC/test record was executed. No legacy Case/history/Finance DML in Apply; existing scoped schema/security objects remain exact.
- Release binding checks: 13/13 local static/PostgreSQL tests PASS; deliberately unbound verifier still fails closed. Candidate unchanged.
