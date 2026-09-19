# VP UI System v1

Application UI baseline, 2026-09-15. Additive adoption, not a replacement framework.
Companion inventory: [Finance consistency audit](../finance/FINANCE_UI_CONSISTENCY_AUDIT.md).

## Principles and boundaries

VP is a working office system: restrained borders, readable Thai/English, compact
hierarchy, predictable actions, and facts before technical evidence. Use unframed
sections with dividers. Cards are appropriate for repeated records and framed tools,
not for every section or for cards inside cards. No decorative dashboards.

- The user enters facts only they know. Never ask them to re-enter calculable values.
- Prefer controlled selections to free text when the business contract provides choices.
- Do not infer unknown tax treatment, classification, or evidence from appearance.
- Substantial creation belongs on a workflow page; focused edits default to a modal.
- Read-only facts use text/definition lists, not disabled selects or fake inputs.
- Preserve source/lifecycle labels separately. Plain language must not change meaning.
- A Finance workspace should answer: Where did the money come from? What is it?
  Who is entitled to how much? What should happen next?
- Never implement missing business semantics through a visual component.
- Shared presentation has no Supabase, permission, router, calculation, or persistence dependency.

Do not change financial arithmetic, RPCs, guards, snapshots, numbering or permissions
when adopting the system. Do not add lifecycle entry paths to lists. Never test on
Production business records as part of a UI refactor.

## Canonical references

| Pattern | Reference | Preserve |
| --- | --- | --- |
| List | `app/finance/payments/page.tsx` | Incoming Money sources, exact lifecycle filters, bounded paging, separate cash/WHT/settlement, responsive table |
| Create | `app/finance/direct-money/form.tsx`, `new/page.tsx` | Actual-money-first entry, controlled tax choices, derived amounts, optional evidence, one final save |
| Read-only detail | `app/finance/direct-money/[id]/page.tsx` | Plain facts, source/classification evidence, frozen confirmed evidence, focused edit dialog |
| Workflow modal | `app/finance/payments/vp-distribution-panel.tsx` | Evidence then decisions; Referral/Company/Work groups; reconciliation and existing next action in footer |
| Edit modal | `app/clients/ClientModal.tsx` | Reusable body, explicit Save/Cancel, existing busy/dirty exit protection and nested confirmation |
| Reusable detail modal | `app/components/DetailModal.tsx`; Billable Charge usage | Open long record detail without expanding every list row or discarding the list context |
| Customer document | `LegalDocumentLayout`, `DocumentIdentity`, domain document renderers | Independent A4, logo, language, snapshot, pagination, print exclusion and table contracts |

The read-only reference is selected for its clear separation of facts from editing,
not as a new authority for other domains' snapshots.

## Tokens and scope

`app/components/ui/vp-ui.module.css` is opt-in. Its `.scope` class defines variables
locally, including on portal backdrops. There is no new `:root`, global reset or
styling package. Existing global light-mode/input rules are unchanged.

| Group | v1 standard |
| --- | --- |
| Content | `--vp-content-width: 1160px`; center with `min-width: 0`; no extra padding inside an already padded guard |
| Spacing | 4 / 8 / 12 / 16 / 24 / 32px; 24px section separation; mobile outer gutters 16px |
| Radius | 6px controls, 4px badges, at most 8px framed tools/dialogs |
| Surface | White base, `#f4f6f8` subdued, `#bec8d0` control border, `#dce2e8` divider |
| Text | `#20272f` primary, `#586874` secondary; zero letter spacing |
| Forward action | `#17664b`, hover `#11553d`; white text |
| Meaning | Success green, warning amber, danger red, info blue; always with a readable label |
| Distribution | Existing Referral `#775421`, Company `#28664b`, Work `#285b80`; never interchangeable lifecycle colors |

Tokens are adopted selectively in Direct Money and modal presentation. Legacy domain
CSS may retain literal fallbacks until its route is migrated. Do not bulk replace
hex values or apply `.scope` to a printable document root.

## Typography

Use the existing application font stack; no font downloads or viewport-scaled fonts.

| Role | Size / emphasis |
| --- | --- |
| Page title | 24px, heading weight, line-height 1.4 |
| Section title | 18px, medium/bold, line-height 1.5 |
| Subsection | 16px, medium |
| Body / label | 14px; labels medium, body normal; Thai multi-line copy ~1.6 |
| Helper / read-only label | 13px, muted but readable |
| Table heading / badge | 12px, medium; avoid excessive uppercase/extra-bold |
| Read-only amount | 15px, tabular numerals; emphasize selected authoritative totals only |
| Modal title | 22px desktop, 19px mobile; no hero-sized modal headings |

Allow Thai/English labels to wrap. Do not shrink long financial values to illegibility.

## Implemented shared patterns

Import from `app/components/ui/patterns.tsx` and the opt-in CSS module. These are
small presentational helpers, not a generic form/table state framework.

| Pattern | Usage and ownership |
| --- | --- |
| `PageShell` | Section with centered width, no nested `main` and no automatic gutters |
| `PageHeader` | Title, optional concise context, separate actions; callers keep translations and destinations |
| Action CSS | `.primary`, `.secondary`, `.danger`, `.quiet`; use on native buttons or links within `.scope` |
| `FilterToolbar` | Named group of existing native filters; caller retains filter/query state |
| DataTable/List | Retain `finance-record-list.module.css` and Incoming Money's column model; no new table engine |
| `StatusBadge` / `statusTone` | Caller supplies actual status and translated domain label; unknown states neutral |
| `SourceBadge` | Separate informational source label; never implies confirmation or eligibility |
| FormSection | `.section` or existing token-aligned domain section; real `h2`, divider, no floating card |
| `FieldGroup` | Existing native control plus associated label/help/error; retains control props and descriptive IDs |
| `Disclosure` | Native, keyboard-operable, closed initially; plain title and chevron |
| `ReadOnlyGrid` | `dl/dt/dd`; keys and values supplied by caller, optional emphasis |
| `MoneySummary` | Formats already-computed numeric amounts at 2 decimals plus explicit currency; missing/nonfinite is `-` |
| Detail / Workflow / Edit modal | One `DetailModal` with `size="detail" / "workflow" / "edit"`; no parallel modal engine |
| StickyActionBar | Use existing `DetailModal.footer`: non-scrolling sibling of body, not an overlay. Page final review stays after content |
| `EmptyState` | Quiet divider band; distinguishes empty from loading/error and explains normal creation path |
| `Callout` | Info/warning/success/negative, optional `role="status"` or `role="alert"`; do not make every informational line live |
| TechnicalEvidence | `Disclosure` with exact escaped raw evidence in `pre`; normal view gets source-owned human summary |

Avoid adding a component for each DOM tag. For example, `FormSection` and
`StickyActionBar` are documented compositions of existing elements, not unused wrappers.

```tsx
<PageShell>
  <PageHeader title={t("finance.nav.payments")} actions={permittedAction} />
  <FilterToolbar label={t("incomingMoney.filters")}>{existingFilters}</FilterToolbar>
  {existingTable}
</PageShell>

<MoneySummary locale={locale} currency={currency} items={[
  { key: "cash", label: cashLabel, amount: authoritative.cash },
  { key: "wht", label: "WHT", amount: authoritative.wht },
  { key: "gross", label: settlementLabel, amount: authoritative.settlement },
]} />
```

## Action and form contracts

Primary is the one forward action for the current stage, not every available command.
Secondary is inspect/edit/reload; destructive belongs below/separate with explicit
reason/acknowledgement where already required. Quiet actions are low-risk auxiliary
commands. Navigation stays visually separate from lifecycle confirmation.

Use lucide icons for familiar commands, with accessible name/tooltip for icon-only
controls. Native links navigate, native buttons act; keep existing disabled/busy and
duplicate-submit guards. Controls have ~42px click targets; modal close is 40px.

`FieldGroup` associates IDs but does not validate, parse or persist. The caller keeps
`aria-invalid`, rules, focus-on-error, state and server errors. Use native select,
radio/segmented choices, checkbox, number input or textarea appropriate to the fact.
Errors appear beside their field and in an existing form summary; don't rely on
browser alerts. Preserve field values and error relationships when switching locale.

Optional and advanced fields stay disclosed, not removed from the contract. Raw audit
identifiers belong in technical evidence. Human explanations remain visibly human;
never label manual text as system-derived.

## Money and statuses

MoneySummary performs **formatting only**, no sums, percentages, rounding policy or
zero substitution. Pass values from the existing calculation/authoritative source.
Tables right-align numeric columns and use tabular numerals; at narrow widths each
amount retains its own visible label. Currency remains explicit (`THB` where stored).
Cash, WHT credit, VAT, gross/settlement and distributable amount never share one
ambiguous total. A missing value is not zero. Customer documents keep their formatter.

| Status value | Display treatment | Meaning stays distinct |
| --- | --- | --- |
| draft | neutral | Not confirmed/issued |
| confirmed | success | Existing domain confirmation |
| reviewed | info | Reviewed, not finalized |
| finalized | success | Finalized distribution, not payment settlement |
| issued | success | Document issued, not automatically paid |
| cancelled | negative | Existing cancellation meaning |
| voided | negative | Historical issued document remains accessible |
| reversed | negative | Reversal, not cancellation |
| unclassified | warning | Missing classification, separate from lifecycle |
| pending | warning | Awaiting the domain's next prerequisite |

Status text remains in existing bilingual domain helpers. Shared color is not shared
business meaning; `completed`, `active`, `sent` and other domain states are not renamed
by this module. Never translate a database enum by reusing an unrelated domain label.

## Modal and responsive contracts

- Default detail: 920px cap; focused edit: 720px; workflow: 1040px. All cap at 88vw.
- Header stays above independently scrolling body. Footer is its non-overlapping sibling.
- Under 600px use full available viewport with safe-area padding, no decorative radius.
- Body has `min-height: 0`, vertical scrolling and overscroll containment.
- Preserve existing Escape/backdrop busy/dirty handling and nested top-dialog ownership.
- Focus starts at named close, wraps through visible controls and disclosure summaries,
  and returns to the opener. Closed disclosure descendants are not tab targets.
- Keep footer summary compact. Check long content and short-height devices before adoption.
- Page actions remain after review. Do not create a floating page approval overlay.
- At 390/768/1024/1440 verify both locales, no page overflow, complete labels, visible focus,
  readable semantic colors, scrolling and footer clearance. Use synthetic local records.
- Table mobile layout retains semantic header/body mapping and `data-label`; do not reorder
  monetary meanings. Genuine complex allocation tables may scroll inside a named region.

## Do / Don't

| Do | Don't |
| --- | --- |
| Read-only labeled authoritative cash/WHT/VAT | Disabled controls that look editable |
| Focused edit modal from long-detail list | Inline editors opening across every row |
| Closed technical evidence with exact payload | Raw UUID/JSON as primary business copy |
| Existing TH/EN domain wording | New generic labels that merge financial statuses |
| Scoped tokens on application surfaces | App CSS reset on A4/print renderers |
| One final review action after facts | Duplicate approval actions before review |
| Adopt as touched, with regression tests | Reformat every Finance file or change arithmetic |

## Adoption gate

For each later route: select reference, preserve props/state/handlers, replace only
presentation, verify semantics in both locales and 4 widths, inspect diff for unintended
business changes, then deploy. Keep document renderer changes in a separate reviewed task.
Do not begin Entitlement, Payables or Cashbook as part of v1.

## Finance hardening adoption (054)

- Desktop navigation keeps the existing overlay rail and menu tree. Coordinate width,
  labels, submenus and chevrons in 180-240ms (currently 220ms); disable transitions for
  reduced motion. Never shift the main content when expanding the rail.
- Reveal the current link inside the navigation scroll container on expansion, route
  change or mobile drawer open only. Open the current Finance module. Do not scroll
  the document or override subsequent manual navigation scrolling.
- 390px is a visual design target, not merely an overflow test. Keep financial meaning,
  readable amounts, compact hierarchy, stacked labeled rows, comfortable controls,
  modal focus trapping and visible primary actions. Inspect TH/EN screenshots at
  390/768/1024/1440, including expanded navigation and technical disclosures.
- `FinanceEvidence` provides a collapsed human-readable technical summary. Its nested
  Raw JSON disclosure is rendered only for Admin, also closed by default. Do not show
  raw UUIDs, fingerprints or internal contracts as operational labels. This is a UI
  boundary; existing server/RLS access is not changed. Adopt only when a page is touched.
- SYSTEM EVIDENCE FIRST; attachments only when materially necessary. Prefer structured
  facts, references/URLs, actor/time, hashes and existing document links. Never require
  duplicate uploads of documents already in VP OS. A calculated tax deadline freezes
  its reviewed rule/channel/calendar evidence, not an uploaded monthly calendar.
- A current system balance is STOCK; confirmed money received in a selected month is
  FLOW. Label them explicitly and show server-backed components. Unknown is never zero.

## Finance presentation freeze

- Tax Overview has four owner summaries: current system cash balance, monthly VAT,
  incoming WHT credit, and Payables. No monthly received-cash summary card. Explain
  that the current balance comes from Opening Balances and Cashbook, not monthly receipts.
- Do not mount the legacy inline Tax Register on Overview. Only the existing Admin
  role sees the secondary audit action. Its focused read-only modal reuses loaded
  monthly/source/history evidence, with nested closed Raw JSON; no new reads or actions.
  Register evidence counts are not filing allocation completeness or monthly VAT totals.
- Treasury leads with Opening + post-cutoff inflows - outflows = current balance.
  Do not compare monthly source cash alongside this stock. Pre-cutoff evidence belongs
  after current movements, collapsed and read-only; it is not an actionable pending queue.
- Retain the accepted Filing page, schema-2 monthly facts versus allocation coverage,
  reviewed-rule/channel due dates, and controlled Admin-only exceptional override.
  No rule means review required, never a guessed deadline. Structured evidence needs
  no mandatory attachment. Preserve the deployed sidebar tree and interaction contract.
