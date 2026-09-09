# Combined Receipt / Tax Invoice: Candidate 040

Local implementation only. Migration 040, the application changes, and these
operator scripts require review before any Production apply or deployment.
Migrations 001-039 are not edited. No business-data backfill is included.

## Identity and numbering

`finance_combined_documents` owns the Payment link, Receipt/Tax Invoice pair,
status, issue date, issuer, permanent number and frozen paired evidence.
`finance_combined_document_audit_events` records its append-only history.

The underlying domains stay separate. Their existing non-null issued-number
contracts are retained by mirroring the SAME `VP-RTI-YYYYMM-NNNNNN` number under
explicit `combined_document_id` links. Deferred guards require matching numbers,
statuses, issuers, timestamps, snapshots and immutable pairing.

The `receipt_tax_invoice` profile is monthly with six sequence digits. Only the
controlled Issue RPC calls its private allocator. Drafts consume no numbers;
combined Issue consumes neither RC nor TI sequences. Transactional counters,
unique coverage/pair indexes and Payment-first locks serialize retries. A failed
second-side write rolls back the entire Issue and counter change. A retry returns
the same issued identity. Multi-session contention still requires later human UAT;
the local PGlite tests exercise retries, uniqueness and rollback, not real parallel
database sessions.

## Authoritative decision

`finance_vat_treatment` normalizes stored evidence without interpreting descriptions,
economic classifications, funding modes or VAT-zero amounts as legal treatment.
Positive explicit applicability/rate resolves `standard_rate`. All other resolved
treatments require explicit stored treatment and reason. Zero-rated remains tax
relevant; exempt, outside-scope, disbursement and pass-through are Receipt-only.

`finance_document_invoice_lines` reads active Draft items or frozen issued items.
`finance_payment_document_decision` consumes effective Payment allocations. Public
permission-checked wrappers serve Invoice readiness, Payment/Receipt next actions,
Tax eligibility and combined workflow. Both standalone Issue/create paths enforce
the same backend routing rules; staff cannot choose Receipt-only to bypass tax.

- All lines explicitly non-tax: Receipt only; partial settlement is supported.
- Any relevant line with full single-Invoice coverage: combined document.
- Unknown treatment: blocked, with the exact unresolved lines returned.
- Taxable/mixed partial coverage: blocked, without proportional tax-base guessing.
- Tax-relevant multi-Invoice Payment: explicitly unsupported and blocked in this
  version. Non-tax multi-Invoice Receipt behavior remains available.
- Existing valid standalone Receipt: TI completion-only, never converted to RTI.
- Existing valid standalone Tax Invoice: RC completion-only.
- Existing internal standalone Draft: open/review and cancel that Draft before
  preparing a paired replacement. No automatic cancellation or adoption occurs.

Buyer identity, tax point, issue date, delayed issue acknowledgement, source
freshness, immutable logo and external-document checks remain hard Issue guards.
Draft preparation may precede completing identity/tax-point evidence; it does not
grant Issue eligibility. A combined operator needs both domains' permissions.

## Prospective treatment

Nullable `vat_treatment_json` evidence is added to Quotation, Fee Agreement,
Billing Installment, Billable Charge and Invoice items. Controlled Quotation and
Charge saves accept it without changing their public signatures. Quotation
commercial snapshots and Charge ready snapshots freeze it; lineage triggers carry
it to downstream items, including V1 item lineage where applicable. Issued Invoice
snapshots include the new item field through their existing complete-row snapshot.

No existing row is updated by this migration. Null historical evidence stays
historical; explicit positive-rate frozen VAT can still resolve safely. New
unresolved evidence is non-null `unknown` and blocks Invoice Issue. Staff review it
upstream, not at Payment. Editing tax facts clears stale treatment before the atomic
save applies new evidence. No totals, allocations or VAT calculations are replaced.

The Invoice Draft shows line treatment and downstream document meaning before final
Issue review, with an early buyer-identity warning. Historical unknown zero-VAT
sources remain blocked downstream and need a separately approved adaptation, never
a guessed snapshot rewrite.

## Mixed payment and presentation

For base 10,000 + VAT 700 + explicit non-tax 2,000, Receipt coverage is 12,700 and
Tax coverage is 10,700. Each relevant line has exact reserved/issued tax coverage;
the non-tax line is not added to the VAT base. WHT changes cash/settlement display,
never VAT coverage. Actual PostgreSQL issued paired evidence is tested through the
shared renderer.

The combined customer view has one Thai/English identity and one RTI number,
immutable logo/identities, separate payment/tax-point/issue dates, treatment per line,
VAT base/tax/non-tax totals, WHT and actual cash, plus manual authorization.
It reuses the existing indigo theme and A4 layout. Narrow screens pan the same A4
document rather than changing column semantics. Print excludes application chrome.
Issued rendering reads paired frozen evidence and has no live-logo fallback.

There is no generic Combined Void. Issued domains and their histories stay immutable;
future credit/debit/replacement processes require separately approved workflows.

## Recovery and external evidence

Current standalone `VP-RC-202609-000001` remains RC; its future missing tax side is
TI completion-only. The protected Invoice/Payment/Receipt are not adapted or changed.

If either side already exists outside VP OS, the operator must stop. Do not check
the "no external document" acknowledgements. No external-document import or
trusted external-coverage registry is introduced here; external-only completion
requires a separately reviewed evidence-registration workflow. Internal completion
uses existing valid issued domain records only.

Taxable partial support later requires authoritative line-level paid cash/WHT/
settlement coverage and an auditable tax-base policy. Invoice-level partial amounts
cannot safely determine it.

## Operator artifacts

- `scripts/sql/preflight_combined_receipt_tax_invoice.sql`
- `scripts/sql/dry_run_combined_receipt_tax_invoice.sql`
- `supabase/migrations/202607180040_add_combined_receipt_tax_invoice.sql`
- `scripts/sql/verify_combined_receipt_tax_invoice.sql`

Preflight and verifier are one SELECT-only statement and one result row. They
report named checks, failed checks, function/catalog differences and protected-row
hashes. Compare the protected hashes before/after manually; SQL does not pretend to
know an external baseline it has not been given. Global Legacy Ledger or
Compensation counts are not fixed invariants.

Preflight intentionally starts with `external_vp_rti_unused_confirmed = false`.
The business owner must confirm no prior external/manual combined documents or
VP-RTI issuance/reservations before changing that local gate to true. Do not bypass
another failed check. The rollback-only rehearsal embeds exact 040 and verifier,
uses BEGIN/ROLLBACK and contains no COMMIT or business lifecycle calls.

The catalog manifest excludes PostgreSQL-version-specific NOT NULL constraint rows
but verifies column nullability explicitly. It includes conditional RC/TI constraints,
new links, all evidence columns, paired deferred guards, RLS and exact function bodies.

## Local validation

`scripts/tests/combined-document-artifacts.cjs --check` compares exact generated
predecessor extensions and workflow artifacts without running SQL. Generation
is deterministic; review emitted changes, never modify applied predecessors.

New tests: `combined-document-postgres.test.cjs`,
`combined-document-presentation.test.cjs`, `combined-document-static.test.cjs`,
and `combined-document-layout.cjs`, under `scripts/tests`.

The PostgreSQL tests use an isolated in-memory database and synthetic source data.
They apply exact Receipt/logo/Tax predecessor migrations and candidate 040, with
minimal upstream stubs for lineage-trigger contracts. Browser fixtures block all
network requests. They do not authenticate to Supabase or exercise Production UAT.

No Payment confirmation, cash posting, opening balance, Ledger, Compensation or
Revenue Allocation action belongs in any combined document RPC.

## Intended file inventory

Unrelated pre-existing untracked SQL/diagnostics are not part of this task.

- `app/finance/billable-charges/BillableChargeCreateWorkflow.tsx`
- `app/finance/billable-charges/page.tsx`
- `app/finance/combined-documents/[id]/page.tsx`
- `app/finance/combined-documents/[id]/preview/page.tsx`
- `app/finance/combined-documents/document.module.css`
- `app/finance/combined-documents/document.tsx`
- `app/finance/combined-documents/shared.ts`
- `app/finance/combined-documents/workspace.tsx`
- `app/finance/document-decision/invoice-readiness.tsx`
- `app/finance/document-decision/next-action.tsx`
- `app/finance/document-decision/shared.ts`
- `app/finance/document-decision/vat-input.tsx`
- `app/finance/invoices/[id]/page.tsx`
- `app/finance/payments/[id]/page.tsx`
- `app/finance/quotations/shared.tsx`
- `app/finance/receipts/[id]/page.tsx`
- `app/finance/receipts/[id]/preview/page.tsx`
- `app/finance/receipts/payment-next-action.tsx`
- `app/finance/receipts/shared.ts`
- `app/finance/tax-invoices/[id]/page.tsx`
- `app/finance/tax-invoices/[id]/preview/page.tsx`
- `app/finance/tax-invoices/editor.tsx`
- `app/finance/tax-invoices/shared.ts`
- `app/finance/tax-invoices/source-next-action.tsx`
- `app/finance/tax-invoices/tax-document.tsx`
- `app/finance/tax-invoices/vat-treatment.ts`
- `docs/finance/COMBINED_RECEIPT_TAX_INVOICE.md`
- `scripts/sql/dry_run_combined_receipt_tax_invoice.sql`
- `scripts/sql/preflight_combined_receipt_tax_invoice.sql`
- `scripts/sql/verify_combined_receipt_tax_invoice.sql`
- `scripts/tests/combined-document-artifacts.cjs`
- `scripts/tests/combined-document-catalog.json`
- `scripts/tests/combined-document-layout.cjs`
- `scripts/tests/combined-document-postgres.test.cjs`
- `scripts/tests/combined-document-presentation.test.cjs`
- `scripts/tests/combined-document-render-fixture.cjs`
- `scripts/tests/combined-document-static.test.cjs`
- `scripts/tests/combined-document-workflow.cjs`
- `scripts/tests/vat-eligibility.test.cjs`
- `supabase/migrations/202607180040_add_combined_receipt_tax_invoice.sql`
