# Tax Document Correction Foundation (Migration 043)

Migration 043 was manually applied by the operator. The operator reported a passing
Production verifier, no function/catalog differences and zero correction rows.
The protected Combined Draft D903B209 and its Invoice/Payment are not development
fixtures. Repository finalization and UI deployment do not authorize lifecycle UAT.

Applied artifact SHA-256:
`f7a69840b41e47154d2e6bc4779b2642eb6c019512b632104c17ba12ca527e4d`.

## Reuse and Gaps

037 provides immutable Receipt evidence, issue-only numbering, permissions and
documentary-only boundaries. Its Receipt Void path is not a tax correction path.
039 provides issued tax items, tax-point evidence, coverage and immutable tax
snapshots. 040 requires explicit Combined context, both permission domains and
paired Receipt/Tax evidence. 038 freezes logo evidence. 042 supplies reviewed
buyer identity for documentary reissue. None provides a generic lawful issued
tax-document correction domain; no existing CN/DN profile or correction table
was found in the repository. Production availability is a preflight requirement.

## Additive Domain and History

`finance_tax_document_corrections` owns the explicit mode, original Tax/Combined/
Receipt/Invoice/Payment links, parent replacement link, reason, qualifying basis,
event evidence reference, action/event dates, frozen source/review, actors and
Draft -> Approved -> Issued lifecycle. Draft/Approved can instead be cancelled.
An issued case cannot be edited, cancelled or generically voided.

`finance_tax_correction_lines` stores original taxable-item IDs, frozen components
and server-derived before/delta/after base and VAT. `finance_tax_correction_documents`
stores the permanent number and complete immutable issued projection.
`finance_tax_correction_audit_events` is append-only for creation, selected lines,
reason/basis/evidence, exact approval, issuance and replacement/copy links.

Replacements are authoritative records in this **new correction-document domain**,
not duplicate rows in the old Receipt/Tax/Combined tables. The existing originals
and their active source coverage remain unchanged and continue blocking duplicate
collection documents and Payment reversal/reallocation. Their logical `replaced`
state derives from issued correction links. It does not overwrite their original
`issued` status or snapshot. Current-document lookup follows the single replacement
successor chain; original, previous, current and subsequent documents stay openable.
Future reports MUST consume this correction domain, not count replacements as new
Payment coverage or as another original taxable supply.

For a Combined replacement one correction document freezes both Receipt and Tax
projections with one new VP-RTI number and issue timestamp. Deferred checks enforce
the pair and unchanged original Payment, WHT, seller and tax point. There are no
separate child actions or new settlement allocations. Both Tax and Receipt view/
manage/issue permissions are required. Standalone Tax corrections use Tax rights.

## Modes and Conservative Scope

| Mode | Evidence and financial effect | Number |
| --- | --- | --- |
| Credit Note | Existing taxable lines only; cumulative decrease cannot exceed the effective tax position. VAT derives from the original rate; a final full decrease consumes the remaining VAT rounding balance. | New VP-CN |
| Debit Note | Existing taxable lines only; positive structured base increase and server-calculated original-rate VAT. No single or cumulative increase cap relative to the original line base. | New VP-DN |
| Cancel and reissue | Reviewed buyer-identity error only, current verified 042 profile frozen at Draft and rechecked at Issue; original recovered/cancelled/retained acknowledgement mandatory. No amount, seller, tax-point, Payment or WHT change. | New VP-TI or VP-RTI |
| Replacement copy | Lost/destroyed/materially damaged effective issued document only; exact frozen identity, amounts and original number with copy sequence/date/reason/issuer and manual-signature space. No correction or new taxable event. | Same number; no counter |

Debit adjustments may result in a corrected value exceeding twice the original
line base. Explicit source components, reason/evidence, duplicate prevention and
human approval remain mandatory; no original-relative amount limit is imposed.
Credit reductions still cannot take the effective source-line base or VAT below
zero, including after issued debit increases. Neither mode collects cash or
changes Payment/WHT or other financial records.

New service lines, rate changes, seller changes, non-tax-line adjustments,
copies of CN/DN and corrections of already-issued CN/DN are not supported here.
There is no silent workaround or free-form negative total. An adjustment outside
these bounds requires a separately reviewed extension, not a changed Payment.

## Legal Review and Dates

This is a controlled documentary tool, not automatic legal eligibility, filing,
electronic signing or tax-advice software. Before operational release the business
owner/tax adviser must review the supported bases, representations and paperwork.

- The mode and qualifying basis are explicit. An event reference, reason and
  written legal/business review evidence are mandatory. A free-text reason cannot
  select or legalize a mode automatically. See [RD P.80/2542](https://www.rd.go.th/3574.html).
- CN/DN retain original references, carry their own action/issue date and adjustment
  event date, and reject dates beyond the following tax month. Review evidence must
  cover any necessary delayed issuance. Original tax points never change. See
  [Revenue Code 86/9 and 86/10](https://www.rd.go.th/5208.html).
- Documentary replacement gets a **new number but original document face date**;
  its new correction action date and server `issued_at` remain separate. Original
  recovery, cancellation marking and records retention are human obligations.
  See [RD P.86/2542, clause 25](https://www.rd.go.th/3568.html).
- Copy date/sequence/reason/issuer are an annotation to the reproduced document.
  Manual issuer signature, retained copy and the required sales-tax-report record
  remain human work; this phase does not file reports or claim verified signatures.
  See [VAT Notification 36](https://www.rd.go.th/3401.html).

## Fail-Closed Controls

All browser table writes are revoked. RLS allows authorized reads only. Public RPCs
use explicit Tax/Receipt permissions; private source/number helpers are not browser
callable. Root Tax row locks serialize correction creation/issuance. One open case
per root, unique non-cancelled event references, exact request-UUID retry comparison,
unique replacement successor and immutable lines/documents/audits prevent duplicate
processing. Same-case Issue retries return the issued case without another number.
Approved source/profile drift, missing logo evidence, invalid Combined context,
unreviewed/legal acknowledgements, out-of-coverage amounts and counter collisions
fail. Deferred case/document/line checks reject incomplete pairs or altered evidence.
The exact reviewed Draft cannot be edited; cancel it and prepare a new case.

Numbers use the existing monthly counters, six digits and server transaction.
Creation/approval consume none. CN/DN are new profiles; replacements reuse existing
TI/RTI profiles. Failure rolls back counter/document/case/audit together. Issued
numbers remain permanently occupied. Copy sequences do not consume tax numbers.

No RPC writes Payment, allocations, WHT, original documents, Client/profile, Cash,
Opening Balance, Ledger, Compensation or Revenue Allocation. CN/DN tax positions
are not Invoice settlement. Refund, additional collection, WHT correction and
VAT filing are explicitly separate future workflows.

## UI and Operator Workflow

Issued standalone Tax and Combined workspaces expose a focused TH/EN initiation
modal, then a dedicated correction review/approval/issue page. No action appears on
the protected Draft. Historical replacements are annotated alongside original
Preview/Print without rewriting frozen content. Shared A4/identity/logo rendering
is reused; cancellation is subordinate; no generic Tax Invoice Void is introduced.

1. Review this candidate, especially additive replacement history, legal bases,
   source-linked adjustments and manual paperwork. Confirm no external CN/DN numbers/reservations.
2. The retained `scripts/sql/preflight_tax_document_correction_foundation.sql`
   records the owner's explicit confirmation that no external/manual CN/DN numbers
   have ever been issued or reserved. Its human gate is true. It is
   one SELECT result row. Return all failed checks and function differences.
3. Only after review/preflight approval, a human may run the prepared rollback-only
   `dry_run_tax_document_correction_foundation.sql`. It embeds 043 exactly, records
   protected evidence/counters in a transaction-local setting and ends ROLLBACK.
4. Candidate apply remains a separate human decision. Afterwards run
   `verify_tax_document_correction_foundation.sql`, compare protected hashes, and
   require zero correction rows/no new number consumption. No lifecycle test is
   embedded in the Production scripts.
5. Only after human apply plus verification may the schema-dependent UI be committed
   and deployed. No current Production UAT document is to be issued in this task.

These are retained deployment artifacts, not instructions to reapply Migration 043.
History lists show the type, status, number, creation timestamp and document date;
the correction detail also shows the actual issuance timestamp. Original face dates
are never mislabeled as replacement issuance timestamps.

Local PostgreSQL fixtures exercise synthetic sources, permissions/RLS, exact artifact
catalogs, coverage, immutable evidence, retry, rollback and original financial
equality. Browser fixtures block all external requests and use synthetic RPC adapters.
They are not Production UAT or evidence of an applied migration.

## Prepared File Inventory

New artifacts (19 files):

- `supabase/migrations/202607180043_add_tax_document_correction_foundation.sql`
- `scripts/sql/preflight_tax_document_correction_foundation.sql`
- `scripts/sql/dry_run_tax_document_correction_foundation.sql`
- `scripts/sql/verify_tax_document_correction_foundation.sql`
- `app/finance/tax-corrections/[id]/page.tsx`
- `app/finance/tax-corrections/workspace.tsx`
- `app/finance/tax-corrections/initiation.tsx`
- `app/finance/tax-corrections/history-notice.tsx`
- `app/finance/tax-corrections/document.tsx`
- `app/finance/tax-corrections/shared.ts`
- `app/finance/tax-corrections/corrections.module.css`
- `lib/i18n/messages/tax-corrections.ts`
- `scripts/tests/tax-correction-postgres.test.cjs`
- `scripts/tests/tax-correction.test.cjs`
- `scripts/tests/tax-correction-render-fixture.cjs`
- `scripts/tests/tax-correction-browser.cjs`
- `scripts/tests/tax-correction-artifacts.cjs`
- `scripts/tests/tax-correction-catalog.json`
- `docs/finance/TAX_DOCUMENT_CORRECTION_FOUNDATION.md`

Existing files with scoped changes (9):

- `app/finance/tax-invoices/editor.tsx`: issued-only modal/history and print annotation.
- `app/finance/tax-invoices/[id]/preview/page.tsx`: original replacement-history annotation.
- `app/finance/tax-invoices/tax-document.tsx`: optional correction annotation/header override.
- `app/finance/combined-documents/document.tsx`: same optional rendering inputs.
- `app/finance/combined-documents/workspace.tsx`: original replacement-history annotation.
- `lib/i18n/catalog.ts`: register correction messages.
- `scripts/tests/combined-document-postgres.test.cjs`: optional unconfirmed synthetic
  Payment setup, retaining the existing default, to use authoritative structured WHT.
- `scripts/tests/i18n-inventory.cjs`: classify the new customer document renderer
  under the existing fixed-document-language boundary.
- `scripts/tests/i18n-core-workspaces.test.cjs`: isolate the new correction
  components without loading application auth or making network requests.

Unrelated pre-existing untracked files are excluded. No applied migration is changed.
