# Phase 6A Receipt Foundation

Migration 037 adds ordinary printed/PDF Receipt evidence. It does not implement
the Revenue Department e-Tax Invoice / e-Receipt system. Payment remains the
settlement authority. None of the Receipt RPCs changes Invoice, Payment, Cash,
Opening Balance, Legacy Ledger, Revenue Allocation or Compensation.

## Coverage and lifecycle

- One confirmed Payment has at most one active Receipt (`draft` or `issued`).
- A Receipt covers the entire Payment, including all effective Invoice
  allocations. Cash plus WHT credit equals settlement; WHT is not cash.
- Partial Payments have separate Receipts. A cumulative statement is not a
  second Receipt for settlement already covered.
- Drafts are unnumbered. Issue freezes the reviewed source and atomically
  allocates `VP-RC-YYYYMM-NNNNNN` using Payment `received_on` as the document date.
  System `issued_at` is separate. Exhausted six-digit periods fail closed.
- Create/Issue retries reuse the current Receipt/number. Cancellation consumes
  no number. Void preserves all issued evidence and never reverses Payment.
- The next Draft after a Void points to the latest voided predecessor. Its
  eventual Issue receives a new number. Cancelled replacement Drafts do not
  prevent a later replacement attempt.
- Creation requires an explicit staff acknowledgement that external/manual
  Receipt coverage has been checked. The database cannot determine whether
  paper receipts exist outside the system.

## Source and historical evidence

The Draft captures current Document Settings seller identity (approved Head
Office default when branch labels are absent), actual Payment receiving-account
master details, stored Payment facts/WHT components and effective allocations.
Customer identity and Invoice descriptions come from issued Invoice snapshots,
not live Client/Billing Plan records. Conflicting frozen customer identities
across Invoices fail closed. Missing mandatory issuer, customer, receiving-account
or issued Invoice evidence must be resolved through the source's controlled
workflow; no manual substitute is accepted in Receipt UI.

Issue serializes on Payment, locks Invoice references in UUID order, then locks
Receipt. It rebuilds and compares the complete reviewed source. A changed source
requires explicit refresh and review before another Issue attempt. Drafts do
not block upstream correction; an invalidated Payment prevents Issue. The
historical Draft can still be cancelled.

The Issue caller also supplies the exact reviewed Draft JSON. A second operator
refreshing the Draft cannot silently authorize Issue from an older browser view.
The server compares both current source and caller evidence before numbering.

Issue freezes a versioned JSON document and append-only relational Invoice
coverage. Issued rendering uses only that snapshot, with no current master or
mutable logo fallback. An optional logo is deliberately omitted in this version
until immutable asset versioning exists. Missing mandatory frozen evidence
blocks document rendering. WHT wording does not claim certificate verification.

## Authority and dependencies

Dedicated view/manage-Draft/issue/void profile capabilities default to false.
Active Admins have full authority. Payment confirmation authority does not imply
Receipt authority. Protected profile triggers prevent self-granting Receipt
capabilities. Browser roles have SELECT only on Receipt tables and execute only
the permission-checked lifecycle RPCs. Internal source, audit, dependency and
numbering helpers are not browser-callable.

Active issued Receipt coverage blocks Payment reversal, erroneous correction,
reallocation and applicable Invoice Void dependencies. Existing non-Receipt
dependency registries remain conservative. Cancelled Drafts and voided Receipts
do not become permanent upstream blockers. No original evidence is deleted.

## Phase 6B / Migration 038 boundary

Tax Invoice must be an independent domain record with independent `VP-TI`
numbering, permissions, immutable VAT-line coverage and lifecycle/correction
rules. Its eligibility requires explicit tax-point evidence and a defined
partial-payment VAT allocation policy; neither issued Receipt status nor a
positive Invoice VAT amount is sufficient. Debit/Credit Note effects require
their own controlled contracts.

A future Tax Invoice may reference a Receipt ID, but must not change Receipt
coverage or become a Payment/Cash posting source. Migration 038 must extend the
Receipt Void and upstream dependency guards if a Tax Invoice or another
downstream document has become dependent on an issued Receipt. Optional combined
presentation must reference two independently valid issued records. Migration
037 creates no operational Tax Invoice table or tax-document issuance RPC.

## Local verification and release

Use synthetic PostgreSQL fixtures only for lifecycle tests. Production workflow:
SELECT-only preflight, manually reviewed BEGIN/ROLLBACK dry-run, Migration 037,
then SELECT-only post-apply verifier. No schema-dependent frontend is committed,
pushed or deployed until the human operator reports Production verification PASS.
No historical Receipt, Payment or Cash backfill is part of this phase.

### RPC contract

All public lifecycle functions return the Receipt UUID. They authorize the active
actor, not the browser's claimed role.

```text
create_finance_receipt_draft_from_payment(p_payment_id uuid, p_external_receipt_checked boolean)
refresh_finance_receipt_draft(p_receipt_id uuid)
issue_finance_receipt(p_receipt_id uuid, p_acknowledged boolean, p_reviewed_snapshot_json jsonb)
cancel_finance_receipt_draft(p_receipt_id uuid, p_reason text)
void_finance_receipt(p_receipt_id uuid, p_reason text, p_acknowledged boolean)
```

There is no generic Draft save RPC: staff do not re-enter known financial,
identity, date or allocation facts. Replacement uses the normal Create path
after the predecessor is voided.

### Validation results

- 43 in-memory PostgreSQL/PGlite tests: full Migration 037, actual predecessor
  Payment reversal/correction/reallocation RPCs, permission roles/RLS, immutable
  evidence, deferred constraints, full/partial/multi-Invoice coverage, retries,
  numbering exhaustion, stale-source and stale-browser review rejection.
- The exact rollback-only operator script executes locally and leaves no Receipt
  objects or added permission columns. The preflight and verifier compile; the
  verifier passes with synthetic protected WHT evidence, fails after an expected
  index is removed, and executes inside an engine-enforced read-only transaction.
- 17 presentation/command/permission tests; 4 SQL static checks. The preflight and
  post-apply verifier each contain one SELECT-only statement and return one row.
  Dry-run embeds the migration and verifier byte-for-byte, BEGIN/ROLLBACK only.
- 105 existing Finance/document tests pass, including structured WHT, Invoice
  composition, installment context, quotation allocations and DocumentIdentity.
- Synthetic Chrome screen checks pass for Draft/Issued/Voided at 1280, 768, 375
  and 320 pixels. A4 PDF checks hide application chrome. A 35-Invoice document
  paginates across four A4 pages with repeated headers and an intact closing
  totals/WHT/footer area; all pages were visually reviewed.
- Targeted ESLint, TypeScript, production build and whitespace checks pass.
  Full ESLint still reports 22 pre-existing `no-explicit-any` errors in Alerts,
  the Case backup page and Case AuditLogSection. Those files were not changed.

These checks do not replace Production preflight or human document UAT. The
isolated fixture is not a live Supabase installation or a multi-connection load
test. Concurrency safety uses shared Payment locks, atomic counters and the
partial unique active-coverage index; retry and stale-review behavior is tested.
Catalog expression/function fingerprints deliberately fail closed on drift.
A Production fingerprint mismatch must be inspected, not bypassed automatically.

Focused local command (requires an existing local PGlite installation):

```sh
PGLITE_MODULE_PATH=/private/tmp/vp-wht-sql/node_modules/@electric-sql/pglite node --test scripts/tests/receipt-foundation.test.cjs scripts/tests/receipt-presentation.test.cjs scripts/tests/receipt-sql-static.test.cjs
```

### Intended file inventory

No applied migration is edited. Unrelated untracked diagnostics are excluded.

```text
supabase/migrations/202607180037_create_finance_receipt_foundation.sql
scripts/sql/preflight_finance_receipt_foundation.sql
scripts/sql/dry_run_finance_receipt_foundation.sql
scripts/sql/verify_finance_receipt_foundation.sql
app/finance/receipts/access.tsx
app/finance/receipts/page.tsx
app/finance/receipts/[id]/page.tsx
app/finance/receipts/[id]/preview/page.tsx
app/finance/receipts/payment-next-action.tsx
app/finance/receipts/receipt-document.tsx
app/finance/receipts/receipt-document.module.css
app/finance/receipts/receipts.module.css
app/finance/receipts/shared.ts
app/finance/receipts/use-receipt-access.ts
app/finance/receipts/use-receipt.ts
app/finance/payments/[id]/page.tsx
app/finance/payments/shared.ts
app/finance/invoices/shared.ts
app/finance/finance-navigation.ts
app/finance/quotations/shared.tsx
app/finance/billable-charges/page.tsx
lib/permissions.ts
scripts/tests/receipt-foundation.test.cjs
scripts/tests/receipt-presentation.test.cjs
scripts/tests/receipt-sql-static.test.cjs
scripts/tests/receipt-render-fixture.cjs
scripts/tests/receipt-layout.cjs
docs/finance/RECEIPT_FOUNDATION.md
```

Shared Finance loaders only select the new capability fields; upstream error
mappers explain issued-Receipt dependencies. Payment financial handlers,
Invoice renderer, DocumentIdentity and previously applied migrations are intact.
The ordinary app reads `.env.local`; do not exercise Receipt writes against
Production before manual Migration 037 verification and explicit UAT approval.
