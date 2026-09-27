# Phase 8C.1 — Non-Litigation UX refinement

Status: Human visual/UX review passed; application release approved. Final release checks passed on the approved implementation.

## Scope and preservation

Repository: `/Users/paolawyer/vp-case-app/vp-case-web`, branch `main`.
Starting HEAD: `77d104b37fe9ca24c63ef9702a5cbdb3191164bb`.

Only Non-Litigation application components, their labels, local asset and tests changed. No shared shell, Case, Finance, permission, database or Production changes. The 34 unrelated files present before this task remain untouched.

Applied Migration 076 remains byte-for-byte unchanged:
`c67ac32ef0572964fcacc31bfc54dbe73544b76a4719436b6afa4a4c67a61afe`.

## Delivered behavior

- Default detail prioritizes current stage, work state, next action, next-action owner, due date, current-stage duration and matter age. Work state remains separate from stage.
- A compact ordered stepper replaces the permanently mounted scenic map. Opening the map takes one click; any compact stage also opens its detail directly.
- The large dialog uses the supplied campaign landscape with real React stage buttons, a dominant ordered route and selected-stage details. Desktop uses horizontal stations; tablet/mobile use a vertical sequence. Escape, close button, nested confirmation and focus return reuse the existing modal behavior.
- Completed-task count/total, actual effort, entered date and duration come from existing stage evidence. Missing evidence stays unavailable. Matter next action is explicitly labeled as belonging to the matter, not attributed to every selected stage.
- Previously visited stages are not claimed to be completed work. The progress count is recorded visits, not a fabricated completion percentage. A secondary dotted bypass appears only for a recorded skip.
- Other client matters show number/title, status, actual stage, lawyer, age and quick-open links. One bounded existing `advisory_control_read` list request supplies these fields; no per-row detail queries or direct database joins. The all-matters link opens `/advisory?client_id=...`.
- Existing plans are always retained. Legacy matters without a plan can preview a starter, but no stage starts until the existing confirmation is saved.
- Existing creation and stage-confirmation actions remain unchanged in number. No approval step was added.

## Starter catalog and backend boundary

Migration 076 accepts exactly five persisted canonical stage sequences. The expanded 17 work starters use those sequences and state this in the UI. They do not claim to introduce 17 distinct persisted stage graphs.

| Work starter | Existing canonical sequence |
| --- | --- |
| General matters | general |
| Contract work | contract |
| Document review | contract |
| Legal opinion | opinion |
| Monthly retainer | general |
| Negotiation | negotiation |
| Company registration and changes | license |
| Licensing and renewals | license |
| Government registration and approvals | license |
| Employment, policies and HR documents | contract |
| Intellectual property and trademarks | license |
| Tax, compliance and internal audit | general |
| Real estate and title review | opinion |
| Debt recovery and pre-litigation restructuring | negotiation |
| M&A, joint ventures and due diligence | opinion |
| PDPA and data privacy | opinion |
| Government liaison and correspondence | general |

The existing legacy work-type options remain available. Existing type-to-sequence mappings are preserved.

Persistent custom-template authoring, distinct new sequences and genuine diverging/rejoining branch graphs are **not implemented**. `advisory076_template` validates five keys; stages have linear positions rather than branch edges. Those features require a separately authorized backend contract/migration task. No existing migration was edited to bypass this boundary.

## Visual asset

`public/advisory/journey-campaign.webp` is a 314,054-byte WebP conversion of the supplied clean landscape (`ChatGPT Image 27 ก.ย. 2569 22_21_39.png`), retaining 1672×941 dimensions. No labels are embedded in the asset. The image is only used inside the mounted map dialog. No new dependency was added.

## Validation

- 43/43 targeted tests passed: 16 disposable PostgreSQL integration/concurrency tests, 7 preflight/preservation tests, 8 existing UI tests and 12 refinement tests.
- After the final wording/null-evidence adjustment, the 20 UI tests passed again.
- Targeted ESLint passed without warnings; `tsc --noEmit` passed; production build passed (49 generated pages, Advisory routes included).
- `git diff --check` passed; final diff and baseline fingerprint review found only intended changes.
- Local synthetic browser smoke passed in TH and EN at 390, 768, 1024 and 1440 CSS pixels for List, detail and map. Document scroll width equaled viewport width at every size. No console/runtime warnings or errors were reported.
- Checked: map initially absent, open/close, selected-stage details, Escape and focus return, nested stage confirmation/cancel, mobile vertical map and detail jump, richer client matters, client-filter navigation, search/empty result, create dialog/preset selection, English labels and legacy unset-stage preview.
- Browser checks use isolated synthetic fixtures and never submit writes. Actual create/task/stage/retry/concurrency contracts are exercised by disposable local PostgreSQL tests, not Production.

Local screenshots: `/private/tmp/phase8c1-screens/` (desktop detail/map, mobile detail/map, TH/EN breakpoint evidence).

## Exact intended file manifest

1. `app/advisory/control/Journey.tsx`
2. `app/advisory/control/MatterDetail.tsx`
3. `app/advisory/control/MatterEditor.tsx`
4. `app/advisory/control/MatterList.tsx`
5. `app/advisory/control/MatterJourney.tsx`
6. `app/advisory/control/MatterOverview.tsx`
7. `app/advisory/control/OtherClientMatters.tsx`
8. `app/advisory/control/control.module.css`
9. `app/advisory/control/journey.module.css`
10. `lib/advisory-control.ts`
11. `lib/i18n/messages/advisory-control.ts`
12. `public/advisory/journey-campaign.webp`
13. `scripts/tests/non-litigation-preview.cjs`
14. `scripts/tests/non-litigation-ui.test.cjs`
15. `scripts/tests/non-litigation-refinement.test.cjs`
16. `docs/core/PHASE8C1_UX_REFINEMENT.md`

## Approved release check

- Human review accepted the hierarchy, modal map, mobile vertical journey, 17 work-type starters and five existing Journey patterns. True branching and persistent custom authoring are explicitly deferred.
- Work Type and Journey sequence remain separate: the create form labels the work type and describes the reused sequence by its localized name. Technical template keys are never required user input; no claim of 17 unique Journey definitions is made.
- Re-ran 43/43 tests, targeted ESLint, `tsc --noEmit`, production build and diff checks successfully without changing the approved application code.
- Reconfirmed TH/EN at 390/768/1024/1440 with zero document overflow and no console/runtime warnings/errors. At 390/768 the actual stage UI is vertical; at 1024/1440 it is horizontal.
- Clicked all nine visible stages: every selected detail matched the clicked stage and the route stayed unchanged. Close button and Escape removed the dialog and restored focus to the map trigger.
- Sibling-matter navigation used the exact sibling ID. Legacy preview had zero current stages and no claimed visits. The artwork is a background-only asset; all Stage text and controls remain DOM elements.
- No Production SQL/data changes or database migration were performed. No Case, Finance or permission changes were introduced.

The existing Vercel Git integration is the release mechanism; the final commit/deployment identifiers are reported in the release response. Human UAT starts after deployment. Custom authoring and true branching remain deferred.
