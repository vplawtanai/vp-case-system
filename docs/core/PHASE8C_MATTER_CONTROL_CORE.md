# Phase 8C — Non-Litigation Matter Control Core

## Status: Migration 076 Production gate PASS; application release authorized

2026-09-27. Repo `/Users/paolawyer/vp-case-app/vp-case-web`, branch `main`.
Application release starting HEAD / local `origin/main`:
`efa557f9c5167212f0663127b35c1e832f09f86d`.
Migration 076 is applied Production history. Following the ordering correction
and the dashboard fetch failure, the human-run attempt-state verifier confirmed
`migration076_state = fully_applied`, `gate_pass = true`, `failed_checks = []`
and `applied_state_exact = true`. The user authorized this application release.
The release does not edit, regenerate or execute Migration 076.

Production preservation confirmed by the user: 9 Matters, 94 Time Logs, 4 Tasks,
13 Issues, 0 Advice records; Finance references unchanged; no identity, Stage or
Time backfill; no invented Journey history; known legacy inconsistencies retained.
Verified footprint: 8 new tables, 3 RPCs, 11 functions, 7 policies, 5 triggers,
3 added columns, and optional `advisory_issue_tasks.advisory_issue_id`.
All 34 unrelated pre-existing untracked files retain their original byte hashes.
Case, Finance, Dashboard, Calendar, Workload, authentication, People profile flags,
numbering 072 and applied migrations 001–075 have not been modified.

## Authoritative reviewed evidence

The user explicitly approved the complete `PHASE8C_A_NON_LITIGATION_CURRENT_STATE`
capture and supplied ten binding decisions in the continuation request.
The exact existing capture was retrieved from the existing review attachment;
no new Production SELECT or write was performed.

- Capture time: `2026-09-27T10:30:22.906424+00:00`.
- `capture_complete = true`, failures empty.
- Original local attachment: `ข้อความที่วาง (1)(3).txt`, 127,488 bytes;
  SHA-256 `cdc6204b3933bbb731ae3bd9dee149a28dbda403e4b913af2396041924ad66f1`.
- Original capture historical fingerprint:
  `43bbad187636d36fb57c7b12f535b58de2c375c877a1b4c68d0a2e026ea07774`.
- Repository evidence: `scripts/tests/fixtures/non-litigation-076-approved-contract.json`.
  Stores exact reviewed catalogs, policies, grants, helper definitions, row
  fingerprints and Finance reference fingerprints; excludes name-match rows
  and private record narratives. No names were converted into identities.
- The original static capture SQL remains unchanged.
- Broader unresolved 490 Finance catalog differences remain **outside this
  acceptance**. They were not investigated or accepted by this task.

Repository migration history alone does not contain the original advisory DDL.
The reviewed capture, not a synthetic schema, establishes the old contract.
Synthetic PostgreSQL rows exercise behavior but never substitute for Production
security or historical fingerprints in the candidate.

## Exact schema delta

Migration: `supabase/migrations/202607180076_non_litigation_matter_control_core.sql`.
Candidate SHA-256:
`c67ac32ef0572964fcacc31bfc54dbe73544b76a4719436b6afa4a4c67a61afe`.

### Function aggregate ordering correction (Human Gate)

The failed candidate SHA was
`fc25a378f675e07c72c67d45d1f1be6aee79b42f1b9b67b99080ec8a0002cae4`.
The human-reviewed diagnostic reports 18 expected and 18 actual functions,
zero individual differences and `order_only_mismatch = true`. Production uses
`en_US.UTF-8`; its default ordering moved `people075_profile_insert()` relative
to the `people_…` helpers. Definitions, ACLs, owners, effective EXECUTE,
volatility and security-definer evidence all match the reviewed baseline.

Both candidate function aggregates now use
`ORDER BY (evidence->>'signature') COLLATE "C"`, matching the builder's UTF-8
byte ordering. The shared snapshot generator and existing SELECT-only verifier
use the same expression. The expected function hash remains
`dffbc07fcd28887910eebe96323cc1b21e756aa71fad061f28b8d454dbdf4372`.
No expected evidence was rebased. The candidate diff is exactly two ORDER BY
expressions; all business/schema SQL and other preservation checks are unchanged.
The previously captured applied object contract is unchanged; only its candidate
SHA metadata is refreshed. Original Preflight, approved capture and failed-run
diagnostic remain unchanged as evidence.

Focused rerun: 31/31 tests PASS (16 candidate DB, 7 capture, 8 UI/render), then
16/16 candidate DB tests PASS with an `en_US.UTF-8` database. Both locale runs
include independent-session transitions, concurrent numbering and idempotent
create retries. New regressions verify reversed-input hashing keeps the same
approved hash and security drift still fails preservation, with full rollback.
Targeted ESLint (23 files), TypeScript, production build and diff/whitespace
checks pass. PostgreSQL shared memory was blocked by the sandbox, and the
sandboxed build stalled; the permitted local reruns completed successfully.
The final before/after file-hash review confirms only the six correction files
changed: this document, candidate, generator, DB tests, applied-contract SHA
metadata and existing static verifier. All application files, approved evidence,
Preflight and diagnostic are unchanged. No Production SQL was executed by the
agent. The diagnostic confirms no 076 objects and unchanged NOT NULL on
`advisory_issue_tasks.advisory_issue_id`; it does not assert historical row hashes.

| Object | Additive change |
| --- | --- |
| `advisory_issue_tasks` | Existing canonical Task table. Make `advisory_issue_id` nullable; keep Matter required. Add nullable `assignee_user_id` and `stage_id`, with FKs and Matter/due index. Keep every existing field and row. |
| `advisory_time_logs` | Add nullable `stage_id`, FK and Matter/Stage index. No attribution/backfill of old logs. |
| `advisory_matter_control` | One-to-one with existing Matter: version, work state, exclusive linked Task or standalone Next Action/person/due, closing timestamp/outcome/summary/follow-up/Case reference. |
| `advisory_matter_team` | Matter/person/role, one Lead; Lead/Co-work/Assistant/QA. |
| `advisory_matter_stages` | Ordered template plan with unique Matter/position and Matter/stage. |
| `advisory_stage_visits` | Explicit visit/skip events, actor, actual entered/exited/recorded times and exit reason. Composite Stage/Matter FK; one current visit per Matter; no fabricated skipped duration. |
| `advisory_work_state_events` | Actual working/waiting/hold intervals with actor/reason; one current interval. |
| `advisory_matter_activities` | Transactional business events, actor/time and before/input evidence; ordered Matter index. |
| `advisory_deliverables` | Title/status/owner/due/version and optional validated `drive.google.com` / `docs.google.com` HTTPS URL. No upload/API/storage. |
| `advisory_control_requests` | Private idempotency keys, actor, exact request body and recorded response. |

There is no universal Matter table and no second canonical Task system.
No new column is added to `advisory_matters`; its existing identity and
Finance FKs remain unchanged.

Three application RPCs:

- `advisory_control_write(uuid,text,jsonb,uuid,bigint)` — atomic create/team,
  Stage/skip, work state, Next Action, Task create/edit/complete/delete/restore,
  deliverable, note, close/reopen.
- `advisory_control_read(uuid,jsonb)` — bounded list, DB summaries and detail;
  **SECURITY INVOKER** preserves existing own-Time visibility.
- `advisory_control_section(uuid,text,integer,uuid)` — bounded Tasks/deleted
  Tasks/Activity/Deliverables/visits/states, 20 rows per page; optional Issue scope.

Eight helpers support permissions, eligible People, five templates and guards.
Five triggers cover Task relationships/completion and transactional Activity/raw
audit, Time relationships, Issue deletion integrity and controlled Matter
lifecycle. Once a control exists, legacy registry status edits cannot bypass
its closing/reopening contract. Original table ACLs and RLS policies are retained.
New table owner is `postgres`; RLS enabled. Authenticated users have SELECT only
on seven public read relations; the request ledger is private. New function
EXECUTE is explicitly revoked from PUBLIC/anon/authenticated/service_role, then
only the three RPCs and two harmless permission/template readers are granted to
authenticated. No default-privilege assumption.

Authorization remains active + password onboarding complete:

- Read / Task / Time: Admin, Partner, Lawyer, Assistant Lawyer, Staff.
- Operational management: Admin, Partner, Lawyer, Assistant Lawyer.
- Delete/restore: Admin, Partner.
- New assignments: active + operational + assignable; Lead additionally legal
  role. Assignment never grants application access. Inactive Admin is denied.
- Time aggregate and Stage effort respect the original per-user RLS. They are
  labelled as actual effort the current reader is authorized to see.

The write RPC locks the request and Matter/control rows, checks optimistic
version, records Activity in the same transaction and returns the original
response for an exact retry. Different payload/actor reuse is rejected. Partial
unique indexes protect one current Stage/work state. Existing atomic 072
creation allocates ADV number and Matter exactly once; no duplicate allocation.

## Exact existing-data behavior

**Migration creates no business rows in any new table.** Existing names, IDs,
dates, lifecycle, raw audit and all Finance rows remain byte-for-byte unchanged
when ignoring the intentionally added NULL columns.

- All 9 existing Matters initially have no current Stage/visits/team IDs.
  UI: “ยังไม่กำหนดขั้นตอนปัจจุบัน” / “Current stage not set”. Selecting a
  Stage explicitly creates a plan and starts the first real timing interval.
- `responsible_lawyer`, `responsible_person`, `assignee_name`, `staff_name`
  remain unchanged. **No identity auto-backfill**, even for unique name matches.
  New IDs stay NULL until explicit reassignment. Historical text is a display
  fallback, not an inferred identity or application permission.
- All 94 Time Logs remain authoritative and unassigned to a Stage. Matter
  actual effort remains available subject to old RLS; Stage effort is unknown
  without explicitly linked logs. Matter age, Stage elapsed time and logged
  minutes are distinct. Missing start date uses created date for display only.
- One live Task and two live Time Logs linked to deleted Issues are preserved.
  Two in-progress Tasks with completed timestamps remain visible with an
  explanatory note. Unrelated edits preserve those timestamps; an explicit
  completion/status correction uses the new consistent contract.
- New links/restores cannot attach live Tasks/Time to unavailable or foreign
  Issues. New Issue deletion cannot strand live children. There is no silent
  cleanup of historical anomalies.
- Existing active `end_date` values remain unchanged. Closing uses separate
  fields; reopening preserves prior outcome evidence in Activity. Closing
  neither fabricates Task completion nor creates a Case.
- Known types choose exact templates: Contract 9, License 8, Opinion 7,
  Negotiation 7, Generic 6. Unknown free-text type is preserved and safely
  previews Generic; the user may explicitly select a template before activation.
  No title-based inference. Plans alone never mean completed visits.
- Existing Finance references (58 company-ledger, 41 claims, 17 compensation
  batches; no orphans) remain untouched. Ten scoped Finance tables are
  fingerprinted; no financial calculations, FKs, rows or writes are added.

## Preservation gate

The candidate is a single `BEGIN`/`COMMIT` transaction, with bounded lock and
statement timeouts. It locks the scoped old tables, recomputes the reviewed
catalog/functions/row/Finance fingerprints and **fails closed** if they differ.
After DDL it removes only explicitly intended 076 additions from the comparison
and asserts the original state is unchanged before commit. New-target conflicts
also fail; there is no ignore-list for arbitrary drift.

`non-litigation-artifacts.cjs` is offline only; no credentials/connection logic.
PG18 represents NOT NULL constraints separately; canonical comparison filters
that duplicate catalog representation while retaining exact column nullability.
The applied contract is captured from tested 076 DDL with explicit new-object
security, never from an unreconciled Finance fixture.

Static `scripts/sql/verify_non_litigation_matter_control_076.sql` is SELECT-only,
self-contained and pinned to the candidate plus reviewed old fingerprints. It
checks original rows/security/functions/Finance, exact new objects/triggers,
empty new control history and NULL new identity/Stage fields. Run immediately
after manual migration and before operational writes; legitimate later writes
will correctly make its historical baseline check fail. No Production verifier
or migration has been run by the agent.

## Application and visual contract

- `/advisory`: compact operational table with real summary counts, bounded
  search/Client/type/Lead/work-state filters, due sorting and pagination.
  390px uses readable Matter cards. New Matter normal input is Client/title/
  type/Lead; create + save = two primary actions.
- `/advisory/[id]`: control summary, interactive Journey, Stage card, Next Action,
  canonical Tasks, Activity, Deliverables, separate actual-effort summary,
  Team, other Client Matters and closing/outcome. Stage inspection is in place.
- Desktop scenic Journey and mobile vertical Journey use one original lightweight
  SVG. It is a clean vector v1 allowed by the design freeze, not screenshot art
  or a recreated logo. Artwork can be replaced without changing workflow/data.
- Task controls in nested Issue pages reuse the same table/RPC/components;
  Matter Tasks do not require an Issue. Linked Next Action derives Task title,
  person and due date and clears on completion/cancel/delete.
- Existing registry retained at `/advisory/records`; existing supporting detail
  at `/advisory/[id]/records` retains Issues, Advice, Time, Finance links, raw
  History and deleted-item workflows. Time editor adds optional explicit Stage.
  These pre-existing supporting screens retain their existing language coverage;
  they have not been claimed as a complete legacy TH/EN rewrite.
- All new core controls/enums render TH/EN through the existing provider.
  User-entered titles/names are not translated. English coverage is enabled only
  for the new exact list/detail routes. Existing official logo/shell preserved.

## Validation

- Reviewed capture tests: **7/7 PASS** in disposable local PostgreSQL 18,
  including READ ONLY execution, no business helper calls, permissions,
  anomalies, privacy, truncation and target conflicts.
- Candidate DB tests: **16/16 PASS** in independent local PostgreSQL sessions:
  exact preservation, fail-closed baseline/ACL mismatch, active/inactive/password
  authorization, People pool, atomic ADV creation, Stage/skip/state history,
  idempotent retry, one-winner concurrent transitions, concurrent numbering,
  duplicate-create retry, Matter/Issue Task paths, Next Action completion,
  deleted Task restore, Issue/Time integrity, own-Time RLS, explicit Stage effort,
  Drive URL validation, closing/reopen and Finance canaries unchanged.
- UI/render tests: **8/8 PASS**, TH/EN, honest legacy Journey, actual vs elapsed
  time, optional Issue/Stage, historical assignee/completion fallback, read-only
  controls and all enum translations.
- Targeted ESLint: PASS, zero errors/warnings.
- `tsc --noEmit`: PASS. Final Production build: PASS (6.9s compile).
  An intervening sandbox build stalled at compilation and was stopped; the
  permitted final local build completed successfully without source changes.
- `git diff --check`: PASS; additional whitespace check covers new files.
- Browser smoke uses real React components with an isolated synthetic read
  adapter; no `.env`, authentication service or Production database traffic.
  TH/EN desktop 1440 and mobile 390 inspected; 768/1024 overflow checks passed.
  Search/clear, create/Task modal open-cancel, Stage inspection, legacy-unset,
  empty and error states checked. No current-preview console errors. Mutating
  behavior is validated by PostgreSQL tests, not claimed as Production UAT.
- Local screenshots: `/private/tmp/phase8c-review/` (desktop list/detail and
  mobile legacy detail, TH/EN). Supporting legacy screens and real Production
  Human UAT remain for the user after application deployment.

Release rerun on 2026-09-27: **31/31 PASS** (16 DB + 7 capture + 8 UI), plus
**16/16 DB PASS** in `en_US.UTF-8`, including independent-session races. Targeted
ESLint across 23 files and `tsc --noEmit` pass. Production build passes (6.7s
compile); diff/whitespace and offline artifact checks pass. Local browser smoke
reconfirmed TH/EN core list/detail, create dialog open/cancel, search/clear and
interactive Stage selection. Measured layout widths 390/768/1024/1440 show no
document overflow; at 390 the Journey stations stack vertically. No browser
console warnings/errors were observed in the isolated preview.

The final release review retains the legacy register byte-for-byte, with only
a Time anchor added to the relocated legacy Matter detail. The only application
change during release review is the Thai wording correction recorded below.
No Production SQL or Human UAT was performed during release validation.

## Application release / Human UAT

The Production migration gate is complete. Do not rerun the migration.
The static function diagnostic and attempt-state verifier remain as gate
evidence. The next Human Gate is application UAT after deployment, starting at
**งานนอกคดี / Non-Litigation → `/advisory` → an existing Matter**.
The agent does not perform Human UAT or mutate Production records.

Final language review corrected only the Thai standalone Next Action heading
to remove the English word “Task”; no workflow or schema behavior changed.

Offline artifact check:

```sh
cd /Users/paolawyer/vp-case-app/vp-case-web && node scripts/tests/non-litigation-artifacts.cjs --check
```

## Intended file manifest

The following 33 files are the Phase 8C release (including the earlier capture
and the two human-gate diagnostic/verifier artifacts). Unrelated untracked files
are excluded.

- `app/advisory/AdvisoryRegister.tsx`
- `app/advisory/[id]/LegacyMatterRecords.tsx`
- `app/advisory/[id]/components/AdvisoryTimeLogsSection.tsx`
- `app/advisory/[id]/issues/[issueId]/components/AdvisoryIssueTasksSection.tsx`
- `app/advisory/[id]/page.tsx`
- `app/advisory/[id]/records/page.tsx`
- `app/advisory/control/Journey.tsx`
- `app/advisory/control/MatterDetail.tsx`
- `app/advisory/control/MatterEditor.tsx`
- `app/advisory/control/MatterList.tsx`
- `app/advisory/control/MatterSections.tsx`
- `app/advisory/control/control.module.css`
- `app/advisory/control/shared.tsx`
- `app/advisory/page.tsx`
- `app/advisory/records/page.tsx`
- `docs/core/PHASE8C_MATTER_CONTROL_CORE.md`
- `lib/advisory-control.ts`
- `lib/i18n/catalog.ts`
- `lib/i18n/core.ts`
- `lib/i18n/messages/advisory-control.ts`
- `public/advisory/journey-landscape.svg`
- `scripts/sql/preflight_non_litigation_matter_control_core.sql`
- `scripts/sql/diagnose_non_litigation_076_function_baseline.sql`
- `scripts/sql/verify_non_litigation_076_attempt_state.sql`
- `scripts/sql/verify_non_litigation_matter_control_076.sql`
- `scripts/tests/fixtures/non-litigation-076-applied-contract.json`
- `scripts/tests/fixtures/non-litigation-076-approved-contract.json`
- `scripts/tests/non-litigation-artifacts.cjs`
- `scripts/tests/non-litigation-postgres.test.cjs`
- `scripts/tests/non-litigation-preflight.test.cjs`
- `scripts/tests/non-litigation-preview.cjs`
- `scripts/tests/non-litigation-ui.test.cjs`
- `supabase/migrations/202607180076_non_litigation_matter_control_core.sql`
