# Phase 6 Finance UI audit and implementation record

Baseline: `main` at `7e631c7465f2750dfc95f45a55c4605dfa5b34db`, equal to origin/main before work.
Audit recorded BEFORE implementation. Approved references: both Phase 6 composite mockups supplied 25 September 2026. They define the hierarchy, compact card/table patterns, restrained semantic colors and modal family; their sample financial values and alternate sidebar labels are not product requirements.

## Findings and decisions

- Shared `DetailModal` already supplies portals, focus containment, Escape/backdrop behavior, body scroll locking and focus restoration. Preserve it; add opt-in Finance presentation and small/detail/review/pay/source variants. Do not replace financial callbacks or validation.
- Lists mix inline CSS, older module tables, plain text status, and recent responsive cards. Unify headers, framed lists, status badges and labeled mobile cards. Preserve queries, filters, permissions, pagination and links.
- Shared `ui/patterns` provides good facts, fields, callouts and badges. Extend with a Finance-only token/component family; do not change non-Finance UI or printable documents.
- Statement, account Statements, Executive Overview and Distribution information hierarchy is frozen. Their page layouts/data code are KEEP; only shared modal/status presentation may receive small polish.
- Full Invoice/Payment/Agreement/composition editors are already pages, appropriately. No page-to-modal conversion, no modal-to-page move needed. Existing long review forms keep item navigator and auto-next.
- Native confirmation prompts remain where replacing them would rewrite lifecycle interaction. New Finance modal variants cover existing React dialogs; no added approval step.
- Existing bank SVGs (`public/banks`) and `AccountIdentity` remain canonical. No logo duplication or document renderer changes.
- Legacy remains grouped under Legacy; no legacy module redesign or cutover.

## Complete route audit

| Route | Classification | Scope / reason |
|---|---|---|
| `/finance/billable-charges` | UNIFY | Shared detail/create/source dialogs, status and action emphasis; long workflow remains page. |
| `/finance/billing-plans/[id]` | UNIFY | Shared detail/create/source dialogs, status and action emphasis; long workflow remains page. |
| `/finance/cash-transactions` | POLISH | Existing dedicated workflow is appropriate; visual headers/status/secondary details only. |
| `/finance/combined-documents` | UNIFY | Shared title/status/list framing; readable mobile cards, preserve source queries and actions. |
| `/finance/combined-documents/[id]` | POLISH | Existing dedicated workflow is appropriate; visual headers/status/secondary details only. |
| `/finance/combined-documents/[id]/preview` | KEEP | Frozen legal/A4 document renderer and preview; no presentation stylesheet crosses this boundary. |
| `/finance/compensation` | KEEP | Legacy; keep existing grouping, permissions and workflows. |
| `/finance/direct-money/[id]` | UNIFY | Shared list/status and read/edit/pay details; keep all known-money derivation and callbacks. |
| `/finance/direct-money/new` | UNIFY | Shared list/status and read/edit/pay details; keep all known-money derivation and callbacks. |
| `/finance/expense-claims` | KEEP | Legacy; keep existing grouping, permissions and workflows. |
| `/finance/expenses` | UNIFY | Shared create/review/detail modal presentation, status and compact list; retain item navigator and correction flow. |
| `/finance/expenses/[id]` | UNIFY | Shared create/review/detail modal presentation, status and compact list; retain item navigator and correction flow. |
| `/finance/expenses/claims` | UNIFY | Shared create/review/detail modal presentation, status and compact list; retain item navigator and correction flow. |
| `/finance/expenses/claims/[id]` | UNIFY | Shared create/review/detail modal presentation, status and compact list; retain item navigator and correction flow. |
| `/finance/expenses/new` | UNIFY | Shared create/review/detail modal presentation, status and compact list; retain item navigator and correction flow. |
| `/finance/fee-agreements` | UNIFY | Shared title/status/list framing; readable mobile cards, preserve source queries and actions. |
| `/finance/fee-agreements/[id]` | POLISH | Existing dedicated workflow is appropriate; visual headers/status/secondary details only. |
| `/finance/fee-agreements/[id]/preview` | KEEP | Frozen legal/A4 document renderer and preview; no presentation stylesheet crosses this boundary. |
| `/finance/invoices` | UNIFY | Shared title/status/list framing; readable mobile cards, preserve source queries and actions. |
| `/finance/invoices/[id]` | POLISH | Existing dedicated workflow is appropriate; visual headers/status/secondary details only. |
| `/finance/invoices/[id]/preview` | KEEP | Frozen legal/A4 document renderer and preview; no presentation stylesheet crosses this boundary. |
| `/finance/invoices/compose` | POLISH | Existing dedicated workflow is appropriate; visual headers/status/secondary details only. |
| `/finance/ledger` | KEEP | Legacy; keep existing grouping, permissions and workflows. |
| `/finance/overview` | KEEP | Golden reference; retain hierarchy, amounts, accounts, running balances and semantics. |
| `/finance/payables` | UNIFY | Shared detail/pay/destructive modal and summary treatment; retain source separation and acknowledgements. |
| `/finance/payments` | UNIFY | Shared list/status and read/edit/pay details; keep all known-money derivation and callbacks. |
| `/finance/payments/[id]` | UNIFY | Shared list/status and read/edit/pay details; keep all known-money derivation and callbacks. |
| `/finance/payouts/[id]` | UNIFY | Shared detail/pay/destructive modal and summary treatment; retain source separation and acknowledgements. |
| `/finance/quotations` | UNIFY | Shared title/status/list framing; readable mobile cards, preserve source queries and actions. |
| `/finance/quotations/[id]` | POLISH | Existing dedicated workflow is appropriate; visual headers/status/secondary details only. |
| `/finance/quotations/[id]/edit` | POLISH | Existing dedicated workflow is appropriate; visual headers/status/secondary details only. |
| `/finance/quotations/[id]/preview` | KEEP | Frozen legal/A4 document renderer and preview; no presentation stylesheet crosses this boundary. |
| `/finance/quotations/new` | POLISH | Existing dedicated workflow is appropriate; visual headers/status/secondary details only. |
| `/finance/receipts` | UNIFY | Shared title/status/list framing; readable mobile cards, preserve source queries and actions. |
| `/finance/receipts/[id]` | POLISH | Existing dedicated workflow is appropriate; visual headers/status/secondary details only. |
| `/finance/receipts/[id]/preview` | KEEP | Frozen legal/A4 document renderer and preview; no presentation stylesheet crosses this boundary. |
| `/finance/revenue-distribution` | POLISH | Golden reference; shared status / payout modal only, no workflow restructuring. |
| `/finance/revenue-distribution/[sourceType]/[id]` | POLISH | Golden reference; shared status / payout modal only, no workflow restructuring. |
| `/finance/statement` | KEEP | Golden reference; retain hierarchy, amounts, accounts, running balances and semantics. |
| `/finance/statement/account/[kind]/[id]` | KEEP | Golden reference; retain hierarchy, amounts, accounts, running balances and semantics. |
| `/finance/statement/company` | KEEP | Existing redirect; do not restore retired economic Statement. |
| `/finance/statement/opening-balances` | POLISH | Keep dedicated transfer/opening workflow, reuse account identity and confirmation framing. |
| `/finance/statement/transfers` | POLISH | Keep dedicated transfer/opening workflow, reuse account identity and confirmation framing. |
| `/finance/tax-corrections/[id]` | POLISH | Existing dedicated workflow is appropriate; visual headers/status/secondary details only. |
| `/finance/tax-invoices` | UNIFY | Shared title/status/list framing; readable mobile cards, preserve source queries and actions. |
| `/finance/tax-invoices/[id]` | POLISH | Existing dedicated workflow is appropriate; visual headers/status/secondary details only. |
| `/finance/tax-invoices/[id]/preview` | KEEP | Frozen legal/A4 document renderer and preview; no presentation stylesheet crosses this boundary. |
| `/finance/tax-position` | POLISH | Keep Month/History/Year architecture; unify source/review dialog framing only. |
| `/finance/tax-position/filings` | POLISH | Keep Month/History/Year architecture; unify source/review dialog framing only. |
| `/finance/treasury` | KEEP | Existing redirect; do not restore retired economic Statement. |

No surface is classified REDESIGN: inspection does not justify replacing any business information architecture. Unification is presentation-only.

## Intended implementation surfaces

Shared Finance tokens/icons/cards/header/filter/list/status/modal; opt-in extension to DetailModal; existing Finance modal callers; quotation/agreement/invoice/payment/receipt/tax/combined list presentation; existing domain status renderers. Add UI/route/semantic regression tests and local synthetic visual fixtures. Do not edit data-layer/RPC/SQL/migration code, document layout/renderers, permission guards or Legacy pages.

## Common-path guard (before)

| Flow | Existing primary actions / decisions | Phase 6 requirement |
|---|---|---|
| List → detail | 1 click, 0 new input | Remains 1 |
| Purchase/claim Create → Draft/Submit | Open + existing Save/Submit, required fields unchanged | No added fields or step |
| Multi-item review | Open + approve/reject each; existing auto-next | No extra selector/click |
| Participant payment | Existing Pay → source/date/authoritative tax → confirm | Same acknowledgements and validations |
| General Payable | Existing detail/prepare/confirm sequence | No added decision |
| Document preview/issue | Existing preview/issue workflow | Unchanged; frozen renderer |
| Statement/VAT source | Open source + optional authoritative link | Same 1–2 clicks |

The common paths above retain their original primary actions, decisions, required inputs, automatic item progression and backend callbacks. Added search/status filters are optional local list controls; they add no step to any financial workflow.


## Implemented system

- Finance-only semantic tokens, WCAG AA text pairs, Lucide icon mapping (30+ concepts), shared headers, filters, framed lists and status badges. No package added.
- Six card variants: metric, source, action, attention, compact, summary. Existing Golden cards retain their hierarchy; the new source/action/summary primitives are used for Payable facts, Direct Money confirmation and participant payment facts.
- Five modal variants: detail, review, payment, destructive, source. Shared close/focus/scroll behavior delegates to the existing DetailModal. Finance adds only icon, color, sizing and mobile footer presentation. Normal non-Finance consumers retain their previous styling.
- Document list framing: Quotations, Agreements, Invoices, Receipts, Tax Invoices and Combined documents. Payment header/status and domain expense/distribution badges reuse the same language. Existing legal document renderers are frozen.
- Tables become labeled mobile cards below 900px. At 390px Finance modals become sheets; small destructive dialogs remain compact. No parallel shell or bottom navigation was introduced.
- The existing Statement bank identity assets also appear in Payment detail. No duplicate bank logos.
- No workflow moved from modal to page: existing long document/edit workflows were already pages. Existing controlled correction/nested payee editor behavior is preserved.
- Audit classifications describe the appropriate treatment for the route; inherited shared presentation covers nested routes without editing their page files. Golden pages, Legacy, redirects and document previews remain structurally intact.

## Final validation (local, synthetic data only)

- Targeted regression: **163/163 PASS** across 22 suites (Finance UI/modal/status/contrast, Statement semantics/overview/completion, Executive, Revenue Distribution/payout/formulas, Company/Reimbursement multi-item flows, Payables UX, Invoice/Payment, Receipt/Tax/Combined presentation, frozen logo, Tax dashboard/filings/authoritative Input VAT).
- Targeted ESLint: PASS, no errors/warnings. `tsc --noEmit`: PASS. Production build: PASS. `git diff --check`: PASS.
- Production-build HTTP route smoke: **50/50** routes, 48 HTTP 200 plus 2 intended redirects, no server error. This is unauthenticated route/build coverage, not authenticated financial UAT.
- Actual React list fixtures: **48 scenarios**, six document lists × TH/EN × 390/768/1024/1440. No viewport horizontal overflow. Search/status filtering checked on Invoice; existing filters and pagination preserved.
- Modal family: **40 scenarios**, five variants × TH/EN × four widths. No modal overflow; footer in viewport; Escape closes and returns focus. Actual Company/Claim reviews: **16 scenarios**, multi-item navigator, reviewed item reopening and responsive containment. Current Create modals: eight TH/EN desktop/mobile captures; no submission.
- Golden References: loaded before/after viewport captures for Statement, account Statement, Executive and Distribution workspace/detail. Statement/account hierarchy and layout preserved. Distribution differences are shared badge styling; Executive differs only in time text. Also TH/EN four-width geometry smoke on all five surfaces.
- AST regression confirms existing database calls and conditional guards are unchanged in every edited application file. No backend contract/data-layer edits.
- **319 protected SQL/document/asset files unchanged** against the start-of-task SHA inventory. All migrations 001–071 unchanged; no 072. The 28 pre-existing untracked SQL/migration files are preserved and excluded from release.

### Known pre-existing test limitations

A baseline checkout at `7e631c7465f2750dfc95f45a55c4605dfa5b34db` reproduced four old failures: two `expense-create-modal.test.cjs` assertions referencing the retired claim form ID, one `payout-ui.test.cjs` assertion for an obsolete sidebar order, and one `unified-statement-ui.test.cjs` byte assertion for a subsequently regenerated static 070 gate. These are documented rather than changing unrelated baseline assertions. The focused current-flow suites above pass. PGlite database migration suites were not run for this UI-only release; no database change is included.

### Evidence

Local screenshots and machine-readable responsive/route results: `/private/tmp/phase6-evidence/`. Use `*-viewport.png` for list/Golden/modal comparisons; full-page capture stitching was unreliable in the browser and is not used for the final comparison. Actual form captures are `company-review-*.png`, `claim-review-*.png`, `company-create-*.png`, `claim-create-*.png`.

Local logs: `/private/tmp/phase6-release-tests.log`, `/private/tmp/phase6-lint.log`, `/private/tmp/phase6-tsc.log`, `/private/tmp/phase6-build.log`. Production verification will be read-only; representative business workflow UAT remains with the user.

## Human visual UAT shortlist

1. Statement overview → one bank account → source detail: balances and source hierarchy remain familiar.
2. Invoices/Quotations list: desktop search/status and mobile cards → existing document detail/preview.
3. Company Purchase request → multi-item review: navigator, amount facts and actions.
4. Reimbursement Create/review: category/linkage controls, sheet scrolling and reachable actions.
5. Revenue Distribution → participant payment modal; inspect recipient/source/amount and close without payment unless intentionally performing Human UAT.

## Exact Phase 6 release manifest

61 intended files; no SQL, migration, financial data, permission or Legacy files.

- `app/components/DetailModal.tsx`
- `app/finance/billable-charges/BillableChargeCreateModal.tsx`
- `app/finance/billable-charges/ChargeVatControl.tsx`
- `app/finance/billable-charges/page.tsx`
- `app/finance/billing-plans/[id]/page.tsx`
- `app/finance/combined-documents/page.tsx`
- `app/finance/combined-documents/workspace.tsx`
- `app/finance/direct-money/[id]/page.tsx`
- `app/finance/expenses/claim-review.tsx`
- `app/finance/expenses/company-review.tsx`
- `app/finance/expenses/create-modal.tsx`
- `app/finance/expenses/purchase-request-review.tsx`
- `app/finance/expenses/request-modal.tsx`
- `app/finance/expenses/request-view.tsx`
- `app/finance/expenses/workspace.tsx`
- `app/finance/fee-agreements/page.tsx`
- `app/finance/invoices/[id]/page.tsx`
- `app/finance/invoices/compose/page.tsx`
- `app/finance/invoices/invoice-composition-editor.tsx`
- `app/finance/invoices/page.tsx`
- `app/finance/overview/workspace.tsx`
- `app/finance/payables/expense-detail.tsx`
- `app/finance/payables/groups.tsx`
- `app/finance/payments/[id]/page.tsx`
- `app/finance/payments/money-allocation-panel.tsx`
- `app/finance/payments/page.tsx`
- `app/finance/payments/vp-distribution-panel.tsx`
- `app/finance/payouts/payee-modal.tsx`
- `app/finance/payouts/workspace.tsx`
- `app/finance/quotations/shared.tsx`
- `app/finance/receipts/[id]/page.tsx`
- `app/finance/receipts/page.tsx`
- `app/finance/revenue-distribution/participant-payment.tsx`
- `app/finance/revenue-distribution/workspace.tsx`
- `app/finance/statement/account-identity.tsx`
- `app/finance/statement/workspace.tsx`
- `app/finance/tax-corrections/initiation.tsx`
- `app/finance/tax-invoices/[id]/page.tsx`
- `app/finance/tax-invoices/page.tsx`
- `app/finance/tax-position/dashboard.tsx`
- `app/finance/tax-position/expense-input.tsx`
- `app/finance/tax-position/external-input.tsx`
- `app/finance/tax-position/filings/workspace.tsx`
- `app/finance/tax-position/page.tsx`
- `app/finance/tax-position/tax-home.tsx`
- `app/finance/treasury/dashboard-view.tsx`
- `app/finance/treasury/maintenance-view.tsx`
- `app/finance/treasury/maintenance.tsx`
- `app/finance/ui/FinanceModal.tsx`
- `app/finance/ui/finance-ui.module.css`
- `app/finance/ui/icons.tsx`
- `app/finance/ui/primitives.tsx`
- `app/finance/ui/status.ts`
- `docs/finance/FINANCE_UI_PHASE6.md`
- `scripts/tests/expense-create-modal.test.cjs`
- `scripts/tests/finance-expense-ux.test.cjs`
- `scripts/tests/finance-ui-phase6-preview.cjs`
- `scripts/tests/finance-ui-phase6.test.cjs`
- `scripts/tests/i18n-workspace-fixture.cjs`
- `scripts/tests/statement-completion.test.cjs`
- `scripts/tests/tax-filing-ui.test.cjs`

## Billable Charges completion polish — 26 September 2026

Start: repo `/Users/paolawyer/vp-case-app/vp-case-web`, `main`, HEAD = origin/main = `42a8cb8510cb98a4117a60bee01323e5a7b3db65`. Staged/unstaged diffs were empty; the interrupted request left no tracked edits to reconcile. Existing untracked SQL/migration files are unrelated and remain untouched.

- Navigation: `รายการเรียกเก็บ` / `Billable Charges`. Full page title and business subtitle retained. Primary action shortened to `สร้างรายการเรียกเก็บ` / `Create Charge`; Compose Invoice remains secondary.
- Reuse FinanceHeader, FinanceFilterBar, FinanceListFrame, FinanceStatusBadge and existing FinanceModal. No shared visual component changes or new package.
- Desktop rows show date, item, customer/matter, classification + VAT, amount/currency, status and a compact Details action. Tablet/mobile uses the shared labeled-card breakpoint with a compact charge-specific arrangement. All prior card facts remain visible.
- Tabs/counts, search predicates, callbacks, invoice links, permissions, lifecycle, VAT and calculations are unchanged. Shared status colors remain authoritative.

| Common action | Before | After |
|---|---|---|
| Open Create | 1 click | 1 click |
| Open Details | 1 click | 1 click |
| Filter status | 1 click | 1 click |
| Search | Focus + type | Focus + type |
| Open Invoice Composer | 1 click | 1 click |

No new mandatory decisions. Existing form, save/readiness and invoice selection steps remain unchanged.

Validation: 34/34 targeted tests passed (Billable Charges runtime/navigation/VAT, shared Phase 6 presentation and Invoice integration/regression). The older Phase 6 AST guard tried to read newly introduced UI components from its pre-Phase-6 baseline; the harness now explicitly requires those new presentation files to have zero database calls/guards, while retaining exact comparisons for existing files. An additional Billable Charges guard compares all business functions and detail/create/edit workflows byte-for-byte with the deployed Phase 6 baseline. No weakened financial assertions.

Targeted ESLint, `tsc --noEmit`, production build and `git diff --check`: PASS. TH/EN at 390/768/1024/1440: eight local browser scenarios with 20 rows, long descriptions and Case/Advisory links; no viewport/cell overflow. All five status filters, Thai search, reference search, keyboard clearing, empty/no-match states, issued/draft/ready/cancelled Details, mobile Create and Compose Invoice navigation checked. No Production transactions performed. Screenshots/geometry: `/private/tmp/charge-polish-evidence/`. Test/build logs: `/private/tmp/charge-polish-tests.log`, `/private/tmp/charge-polish-build.log`.

All SQL/migrations 001–071 unchanged; no Migration 072. No schema/RPC/RLS/data or document renderer changes. Golden Reference pages unchanged. No Legacy Cutover.

Exact release files (8):

- `app/finance/billable-charges/page.tsx`
- `app/finance/billable-charges/billable-charges.module.css`
- `app/finance/finance-navigation.ts`
- `lib/i18n/messages/billable-charges.ts`
- `scripts/tests/billable-charge-browser.cjs`
- `scripts/tests/billable-charge-runtime.test.cjs`
- `scripts/tests/finance-ui-phase6.test.cjs`
- `docs/finance/FINANCE_UI_PHASE6.md`

Human UAT: Finance → รายรับ → รายการเรียกเก็บ. Compare desktop rows/mobile cards, switch TH/EN, search and filter, open an existing item, and verify Create/Compose Invoice launch their familiar workflows. Automated release verification is read-only.
