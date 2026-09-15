# Finance UI consistency audit

2026-09-15. Scope: repository source audit across Finance, selective local synthetic
browser validation of canonical surfaces. No authenticated Production review or writes.
This is not a claim that every deferred route has been visually tested at every width.

System: [VP UI System v1](../ui/VP_UI_SYSTEM_V1.md).

## Findings

| Dimension | Evidence / current drift | v1 decision |
| --- | --- | --- |
| Typography | Quotation title 26px, Fee Agreement 28px, Charge 30px, newer Payments/Receipts 24px; older tables use weight 800/900 | Canonical 24/18/16/14/13/12 hierarchy; defer legacy heading churn |
| Spacing / width | Quotation 1180px/24px, Receipt 1180px, Direct Money 1160px, Client tax identity 1000px; list shell varies by access guard | Opt-in 1160px content token; no extra shell nesting; 16px mobile gutters |
| Form labels | Older inline grids, tax modules and Direct Money repeat labels, 40/42px controls and error relations | Shared FieldGroup; preserve native controls and validation logic |
| Actions | Many equivalent 6/7px white/green buttons; list imported Direct Money CSS for one primary action | Shared action classes remove cross-domain style dependency; destructive remains separate |
| Status | Pills vs text, 11/12/13px; Receipt `.status` green regardless of enum; unrelated lifecycle meanings must not drift | Shared color treatment with caller-owned translated labels; migrate legacy badges later |
| Lists | Incoming Money has explicit column model/mobile labels; Fee Agreement has 1099px minimum table width; tax list hides header on narrow screens | Incoming Money reference; audit wider table/cell accessibility when touched |
| Modal | DetailModal already has portal/stack/focus/scroll lock; Client edit and VP workflow used same width; legacy quotation custom dialog | One modal with explicit sizes; include native summary in focus loop; defer custom-dialog replacement |
| Sticky / final actions | VP footer is body sibling and already contains reconciliation; Billing Plan final review below installments is intentional | Keep modal footer as non-overlay action bar; do not add page approval overlays |
| Empty / callouts | Dashed Charge empty card, plain paragraphs elsewhere; many one-off warning/error blocks | Quiet empty band and optional live semantic Callout for canonical list |
| Read-only facts | New Direct Money has definition lists; Charge/Invoice summary values framed individually | Reuse ReadOnlyGrid/MoneySummary; no fake disabled fields |
| Duplicate CSS | Primary/secondary/danger, definition-list grids, disclosure chevrons, modal header/footer borders | Extract opt-in patterns, not a new styling framework |
| Documents | Invoice/Receipt use LegalDocumentLayout + DocumentIdentity; domain CSS also owns print layouts | No new application selectors in printable documents; keep A4 and financial table contracts |

No new financial P0 defect was established by this presentation audit. P0 below means
a confusing presentation to prioritize, not permission to change backend behavior.

## Route matrix

Severity describes remaining consistency after selective v1 work. PASS is a reference
pattern, not a guarantee of all lifecycle correctness. P1 means shared migration value;
P2 is lower-risk visual polish. Grouped child routes share the listed rendering module.

| Route / area | Current pattern and specific issue | Target pattern | Severity | Priority | Now / later |
| --- | --- | --- | --- | --- | --- |
| `/finance/quotations` | `shared.tsx` inline 26px title, bordered cards, local badges/filters | PageHeader + canonical list, domain badge labels | NEEDS REFACTOR | P1 | Later; preserve list queries and contexts |
| `/finance/quotations/new`, `/[id]/edit` | Large inline editor; repeated section/form/error styles | Fact-first form sections, FieldGroup, disclosures | NEEDS REFACTOR | P1 | Later; calculation/editor extraction separate |
| `/finance/quotations/[id]` | Inline lifecycle UI and custom fixed dialog at z50 | ReadOnlyGrid + DetailModal where appropriate | NEEDS REFACTOR | P1 | Later; keep transition semantics |
| `/finance/fee-agreements` | 28px title, 1099px min table, pill badges | Canonical list and responsive labeled rows | NEEDS REFACTOR | P1 | Later |
| `/finance/fee-agreements/[id]` | Inline 1180px workspace, multiple intentional accepted/formal paths | Shared header/read-only/form patterns, preserve aggregate save | NEEDS REFACTOR | P1 | Later; do not merge lifecycle variants |
| `/finance/billing-plans/[id]` | Context toolbar and end-of-review actions already deliberate; local summary/grid styling | ReadOnlyGrid/summary and header only | MINOR DRIFT | P2 | Later; keep final action below installments |
| `/finance/billable-charges` | Card list + reusable DetailModal; 30px heading, heavy pills, bespoke editor panel and nested framed facts | Canonical header/badges; retain record cards; unify focused editing later | NEEDS REFACTOR | P1 | Shared modal improvement now; page later |
| `/finance/invoices` | `invoice-workspace.module.css` record rows and prominent identity; independent status/action styling | Canonical list shell with own line/context columns | MINOR DRIFT | P1 | Later |
| `/finance/invoices/compose` | Structured sources/review, specialized grids and summary cards | Form sections/readonly facts; controlled source selection unchanged | MINOR DRIFT | P2 | Later; no source/composition changes |
| `/finance/invoices/[id]` | Rich lifecycle, review and history with local styles | Header/badges/read-only patterns incrementally | MINOR DRIFT | P1 | Later; do not move issue checkpoint |
| `/finance/payments` | Responsive merged source list, separate financial columns, bounded filters | Canonical PageShell/Header/Toolbar/Badges/Callout/EmptyState | PASS | P1 | Now; query/state/table contract unchanged |
| `/finance/payments/[id]` | Domain-rich status/evidence/tax/review panels, duplicated button/fact styles | Read-only detail baseline and shared statuses, retain precise semantics | MINOR DRIFT | P1 | Later; VP modal only now |
| VP Revenue Distribution (Payment and Direct Money) | Strong evidence/grouping/progressive details; same generic modal cap, local status span | Workflow-size DetailModal, shared badge/tokens, existing footer | PASS | P1 | Now; formulas and actions unchanged |
| `/finance/direct-money/new` | Fact-first create, controlled tax radios, optional details, live reconciliation | Canonical PageHeader, FieldGroup, MoneySummary and scoped tokens | PASS | P1 | Now |
| `/finance/direct-money/[id]` | Plain facts; focused edit/classification; confirmed source evidence frozen | Canonical readonly detail with shared facts/header/status/technical disclosure | PASS | P1 | Now; no new reads/writes |
| `/finance/receipts` | Separate table/filters; all statuses styled green by `.status` | Canonical list and semantic domain badge | NEEDS REFACTOR | P0 | Later first group; semantic color issue only, text remains accurate |
| `/finance/receipts/[id]` | Strong frozen-evidence definition lists; status styling, local banners; final issue after preview | Shared facts/header/status, preserve preview boundary | MINOR DRIFT | P1 | Later |
| `/finance/tax-invoices` | Distinct shell/filter/list, narrow table hides header | Canonical list with accessible cell labels and source-aware badges | NEEDS REFACTOR | P1 | Later |
| `/finance/tax-invoices/[id]` | Structured tax review/eligibility, mixed app/document CSS module | Shared app-only header/facts/callouts | MINOR DRIFT | P1 | Later; isolate renderer styles before broad adoption |
| `/finance/combined-documents` | Uses `finance-record-list` already; filter in header, plain status text | Shared header/toolbar/badge; no create entry | MINOR DRIFT | P1 | Later with Receipts/Tax lists |
| `/finance/combined-documents/[id]` | Existing shared tax workspace/review with protected child semantics | App-only shell and status/callout pattern | MINOR DRIFT | P2 | Later |
| `/finance/tax-corrections/[id]` | Source-focused correction workspace, domain review/document blocks | Focused facts and shared actions, preserve Credit/Debit meanings | MINOR DRIFT | P2 | Later, no adjustment-policy change |
| `/finance/expense-claims` | Inline create/list; local 24px money, weight 900 headings, scroll table and status text | Canonical list plus focused details/edit, separate creation flow if approved | NEEDS REFACTOR | P1 | Later dedicated task |
| `/finance/compensation` | Large inline batch editor/history, nested framed work-pool panel, pill tags | Canonical sections/read-only details and semantic action hierarchy | NEEDS REFACTOR | P1 | Later; formulas explicitly out of scope |
| `/finance/ledger` | Legacy operational layout and independent filters/actions | Cosmetic migration only if separately approved | NEEDS REFACTOR | P2 | Deferred; no cutover work |
| `/finance/cash-transactions` | Existing cash workspace, intentionally outside this initiative's implementation | Future app-only patterns after lifecycle roadmap approval | MINOR DRIFT | P2 | Deferred; no Cashbook/Opening Balance work |
| Client Edit / Tax Identity (`/clients`, `/clients/[id]/tax-identity`) | Reused ClientModal; dirty guard and bilingual editor; same 920px generic cap | Edit-size DetailModal, original fields and exit behavior | PASS | P1 | Modal size now; tax page CSS later |
| Client/Case embedded Finance sections | `FinanceQuotationsSection` local cards/tables inside parent workspace | Reusable DetailModal for long inspection, compact linked summaries | MINOR DRIFT | P2 | Later; parent context preserved |
| Quotation, Fee Agreement, Invoice `/[id]/preview` | Dedicated legal document styles, A4/Thai/column contracts | Existing document system, not application tokens | PASS | P1 | Preserve untouched |
| Receipt, Tax Invoice, Combined `/[id]/preview`; correction documents | Snapshot-bound document renderers and immutable identity/logo evidence | Existing document system with strict app/print boundary | PASS | P1 | Preserve untouched |

## Implemented now

- New opt-in CSS token/pattern module and small presentational React helpers.
- Incoming Money alignment; obsolete per-page header/toolbar/badge styles removed.
- Direct Money create/detail: shared header, fields, monetary/readonly facts, closed
  technical evidence; no changes to source parsing, calculations, save or lifecycle.
- Shared modal sizes, lucide close icon, readable focus indicator, native summary tab
  handling; default width unchanged for existing detail callers.
- Client uses edit size, VP uses workflow size and existing color groups via tokens.
- Synthetic tests retain existing computation/state/permission coverage and add shared
  status, money, accessibility relationships, contrast and responsive contracts.

## Deferred migration plan

1. **First: Receipt / Tax Invoice / Combined lists.** Small related surface; fix semantic
   status color drift and unify headers/filters/empty states, without adding create paths.
   Preserve document ownership, exact labels, permissions and frozen list summaries.
2. Fee Agreement and Quotation lists: replace wide/mobile and local badge patterns before
   editing their large detail forms. Reuse Billable Charge DetailModal for long inspection.
3. Invoice/Charge app workspaces: reduce repeated framed summaries and editor styles;
   do not combine this with source/lifecycle/financial work.
4. Expense Claims and Compensation: dedicated workflow-aware UI tasks, not broad mechanical
   replacements. Identify list/detail/edit ownership first; preserve every formula.
5. Legacy Ledger and Cash workspaces: only with an approved separate task; no new replacement
   write paths, entitlement or cutover as part of this UI system.

Every migration needs focused tests, TH/EN 390/768/1024/1440 review and a scoped diff.
No priority in this document authorizes Production UAT actions or financial mutations.

## v1 validation record

- 30 matrix entries: 7 PASS, 12 MINOR DRIFT, 11 NEEDS REFACTOR.
- 51 focused component/domain regression tests; 20 additional Charge/VAT/document
  regression tests passed. The existing synthetic Tax Invoice renderer emits React
  warnings for styled-jsx attributes; its assertions pass, and it was not changed.
- `direct-money-browser.cjs`: Incoming Money and Direct Money form/detail in TH/EN at
  390/768/1024/1440; unchanged synthetic save payloads, derived values, permissions,
  readonly evidence, focus and no page overflow.
- `client-modals-browser.cjs`: TH/EN editing, dirty/busy protection, nested confirmation,
  focus restoration, mobile scrolling and four widths.
- `vp-distribution-browser.cjs`: TH/EN workflow, frozen finalized presentation,
  4 widths, body/footer clearance and keyboard wrap through the audit disclosure.
- Shared semantic palette text pairs pass 4.5:1 contrast checks; manually inspected
  representative narrow/desktop list and modal screenshots.
- Targeted ESLint, TypeScript, production build and whitespace checks passed.
- All browser actions use synthetic adapters on loopback with external traffic blocked.
  No Production business records were opened or changed. No migration/backend/renderer
  changes; 25 unrelated pre-existing untracked SQL artifacts preserved byte-for-byte.

Deferred matrix rows remain source-audited, not fully browser-validated. This distinction
must survive future status updates; do not relabel them PASS based only on token adoption.
