# Phase 8C.1 — Matter overview refinement

Status: Human Visual Review passed; final terminology correction approved for release. Final Production UAT remains a Human Gate.

## Project guard

- Repository: `/Users/paolawyer/vp-case-app/vp-case-web`
- Branch: `main`
- Released baseline before this refinement: `8ecde5cd372b6adb9dbff5d38bae3f77784c0763`.
- All 34 pre-existing untracked files preserved and excluded from release.
- Migration 076 unchanged: `c67ac32ef0572964fcacc31bfc54dbe73544b76a4719436b6afa4a4c67a61afe`.

## Presentation and semantics

- Default Overview uses a compact command center and two operational/supporting columns.
- Lifecycle stays in the header. Work State accepts only the five existing work-state values; missing or invalid values display “ยังไม่กำหนด” / “Not set”. It never substitutes lifecycle.
- Final terminology review confirmed a presentation-only issue: persisted `working` is correct. Thai labels now follow the canonical set “กำลังดำเนินการ”, “รอลูกค้า”, “รอภายนอก”, “รอภายใน”, “พักไว้”. English labels, persisted values, lifecycle and backend contracts are unchanged. Regression tests assert the literal TH/EN labels separately from lifecycle.
- Current Stage and Stage Duration remain unset when absent. Closed lifecycle does not invent a recorded stage.
- Section navigation opens focused Tasks, Activity, Deliverables, Time and Team views without new routes. Existing records remain a link to the existing screen.
- Sections remain mounted while switching views. Overview shows the first five active rows; full views retain existing pagination and authorized deleted-task controls. Loading/errors are distinct from genuinely empty results.
- Existing task/activity/deliverable/team forms, RPC payloads, permission checks and write/retry behavior are retained.
- Journey remains a compact stepper with the existing illustrated map dialog. Legacy planning choices are available inside that dialog, with explicit confirmation still required to begin a stage. The 17 work types continue to reuse five supported patterns.
- Time displays exact existing minutes with a derived hours/minutes equivalent. The no-stage time-log count is labelled as such, not presented as total logs.
- No identity backfill, inferred stage history, branching or persistent custom journey authoring.

## Validation — 2026-09-28

- Existing Phase 8C UI/refinement tests: 20/20 PASS.
- New overview regression tests: 12/12 PASS.
- Existing disposable local PostgreSQL/preflight tests: 23/23 PASS, including preservation, permissions and independent-session concurrency.
- Total: 55/55 PASS.
- Targeted ESLint: PASS, no warnings.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS, 49 static pages generated, no build errors.
- `git diff --check`: PASS.
- Local synthetic browser smoke: TH/EN at 390, 768, 1024 and 1440px; no horizontal overflow or captured console/runtime errors.
- Verified focused sections, task form open/cancel, work-state form choices, command-center map open/close, all nine recorded stage selections and mobile vertical map behavior.
- Client sibling links target their exact matter IDs. Legacy unset/empty panels and time semantics inspected separately.
- Browser preview uses synthetic data and rejects writes; no Production requests or data mutations. No Case, Finance, schema, migration, RLS or backend contract changes.

## Exact intended file manifest

1. `app/advisory/control/MatterDetail.tsx`
2. `app/advisory/control/MatterOverview.tsx`
3. `app/advisory/control/MatterSections.tsx`
4. `app/advisory/control/MatterJourney.tsx`
5. `app/advisory/control/OtherClientMatters.tsx`
6. `app/advisory/control/MatterTimeSummary.tsx` (new)
7. `app/advisory/control/overview.module.css` (new)
8. `app/advisory/control/journey.module.css`
9. `lib/i18n/messages/advisory-control.ts`
10. `scripts/tests/non-litigation-preview.cjs`
11. `scripts/tests/non-litigation-refinement.test.cjs`
12. `scripts/tests/non-litigation-overview.test.cjs` (new)
13. `docs/core/PHASE8C1_OVERVIEW_REFINEMENT.md` (new)

## Local review screenshots

Stored outside the repository at `/private/tmp/phase8c1-overview-screens/`:

- `desktop-overview-th.png` — populated desktop overview, 1440px.
- `desktop-lower-th.png` — lower operational cards and closing strip.
- `desktop-unset-th.png` — legacy unset-stage/empty overview, 1440px.
- `mobile-unset-th.png` — legacy mobile overview, 390px.
- The four review images above are viewport captures; responsive TH/EN and map checks are recorded in the validation section.

These are local synthetic previews of the real components, not Production UAT evidence. Human Visual Review approved this layout. Release is authorized after the final terminology correction and validation; stop for Human Production UAT after deployment.
